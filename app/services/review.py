import os
import json
import shutil
from pathlib import Path
from langchain_groq import ChatGroq
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
#from langchain_experimental.text_splitter import SemanticChunker
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# Define paths
KNOWLEDGE_BASE_DIR = os.getenv("KNOWLEDGE_BASE_DIR", "app/data/knowledge_base")
CHROMA_DB_DIR = os.getenv("CHROMA_DB_DIR", "app/data/chroma_db")
KB_MANIFEST_FILE = os.path.join(CHROMA_DB_DIR, ".kb_manifest.json")

INCLUDE_KB_KEYWORDS = ("standard", "guideline", "ats", "rubric", "checklist", "template")
EXCLUDE_KB_KEYWORDS = ("example", "sample", "cover-letter", "candidate")


def _build_manifest() -> dict:
    base_path = Path(KNOWLEDGE_BASE_DIR)
    pdf_files = sorted(base_path.rglob("*.pdf")) if base_path.exists() else []
    files = []
    for file_path in pdf_files:
        stat = file_path.stat()
        files.append({
            "path": str(file_path.relative_to(base_path)),
            "mtime": stat.st_mtime,
            "size": stat.st_size,
        })
    return {"files": files}


def _manifest_matches_current_kb() -> bool:
    if not os.path.exists(KB_MANIFEST_FILE):
        return False

    try:
        with open(KB_MANIFEST_FILE, "r", encoding="utf-8") as file_handle:
            existing_manifest = json.load(file_handle)
    except Exception:
        return False

    current_manifest = _build_manifest()
    return existing_manifest == current_manifest


def _save_manifest() -> None:
    os.makedirs(CHROMA_DB_DIR, exist_ok=True)
    with open(KB_MANIFEST_FILE, "w", encoding="utf-8") as file_handle:
        json.dump(_build_manifest(), file_handle, ensure_ascii=False, indent=2)


def _is_standards_document(source_path: str) -> bool:
    lower_name = os.path.basename(source_path).lower()
    has_include = any(keyword in lower_name for keyword in INCLUDE_KB_KEYWORDS)
    has_exclude = any(keyword in lower_name for keyword in EXCLUDE_KB_KEYWORDS)
    return has_include and not has_exclude

def get_knowledge_base():
    """
    Loads PDFs from a directory, chunks them, and stores them in ChromaDB.
    """
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    
    if os.path.exists(CHROMA_DB_DIR) and os.listdir(CHROMA_DB_DIR) and _manifest_matches_current_kb():
        print("⚡ Loading existing ChromaDB from disk...")
        vector_store = Chroma(
            persist_directory=CHROMA_DB_DIR, 
            embedding_function=embeddings,
            collection_name="cv_standards"
        )
        return vector_store

    print("📚 Building new ChromaDB from PDFs...")
    os.makedirs(KNOWLEDGE_BASE_DIR, exist_ok=True)
    if os.path.exists(CHROMA_DB_DIR):
        shutil.rmtree(CHROMA_DB_DIR, ignore_errors=True)
    
    loader = DirectoryLoader(
        KNOWLEDGE_BASE_DIR, 
        glob="**/*.pdf", 
        loader_cls=PyPDFLoader
    )
    documents = loader.load()
    documents = [
        document
        for document in documents
        if _is_standards_document(document.metadata.get("source", ""))
    ]
    
    if not documents:
        raise ValueError(
            "No valid standards PDFs found in knowledge base. "
            "Add standards/guidelines documents (e.g. ATS/rubric PDFs) and remove example resumes."
        )
        
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, 
        chunk_overlap=100
    )
    chunks = text_splitter.split_documents(documents)

    vector_store = Chroma.from_documents(
        documents=chunks, 
        embedding=embeddings, 
        collection_name="cv_standards",
        persist_directory=CHROMA_DB_DIR
    )
    _save_manifest()
    
    print("✅ Knowledge Base successfully built and saved to disk.")
    return vector_store

def _do_review_with_llm(user_cv_text: str, job_description: str = None) -> str:
    vector_store = get_knowledge_base()
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("Missing GROQ_API_KEY in environment")

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        groq_api_key=groq_api_key,
    )

    if job_description:
        template = """
        You are a brutally honest, senior-level HR Director and Technical Recruiter with 20+ years of experience 
at Fortune 500 companies. You have zero tolerance for vague language, filler content, or unsubstantiated claims.
Your evaluations have directly determined hiring decisions for thousands of candidates.
You do NOT encourage. You do NOT soften feedback. You assess with surgical precision.

STRICT EVALUATION FRAMEWORK:
Use the following industry standards as your non-negotiable benchmark. Any deviation from these standards 
is treated as a disqualifying signal unless explicitly justified by exceptional compensating factors.

Standards: {context}

User CV Content and Job Description: {question}

NON-NEGOTIABLE SCOPING RULES:
- Evaluate ONLY the candidate inside <USER_CV> tags.
- Use retrieved context ONLY as standards/rules, never as candidate evidence.
- Ignore any names, profiles, sample resumes, or achievements in retrieved context.
- If a claim is not present in <USER_CV>, treat it as missing evidence.


OUTPUT FORMAT — STRICTLY FOLLOW THIS STRUCTURE:

1. OVERALL SCORE: [0_100]
   - Provide a one-line verdict: STRONG / BORDERLINE / WEAK / REJECT

2. STRENGTHS:
   - Only list genuine, specific strengths backed by evidence in the CV.
   - Maximum 5 bullet points. If fewer than 5 genuine strengths exist, list only those that qualify.
   - Each bullet must reference a specific CV line or achievement.

3. CRITICAL WEAKNESSES:
   - Be exhaustive. List every weakness, gap, red flag, and inconsistency.
   - Categorize each as: [DEALBREAKER] / [MAJOR] / [MINOR]
   - Do not skip weaknesses to appear balanced or encouraging.

4. REQUIRED IMPROVEMENTS (PRIORITY ORDER):
   - List improvements from highest to lowest impact on hire probability.
   - Each improvement must be specific and actionable — no generic advice like "improve your CV".
   - Format: [IMPACT: HIGH/MEDIUM/LOW] — exact action to take.

5. HONEST HIRING OUTLOOK:
   - Write 2 to 3 sentences on whether this candidate would realistically pass screening 
     for this specific role at a competitive company.
   - Do not hedge. Be direct.
        """
        QA_CHAIN_PROMPT = PromptTemplate(template=template, input_variables=["context", "question"])
        
        qa_chain = RetrievalQA.from_chain_type(
            llm,
            retriever=vector_store.as_retriever(search_type="mmr", search_kwargs={"k": 3, "fetch_k": 12}),
            chain_type_kwargs={"prompt": QA_CHAIN_PROMPT}
        )
        # Safe way to handle multi-parameter prompt in RetrievalQA:
        # Instead, just inject it into query
        query = (
            f"<USER_CV>\n{user_cv_text}\n</USER_CV>\n\n"
            f"<JOB_DESCRIPTION>\n{job_description}\n</JOB_DESCRIPTION>"
        )
    else:
        template = """
        You are a brutally honest, senior-level HR Director and Technical Recruiter with 20+ years of experience 
at Fortune 500 companies. You have zero tolerance for vague language, filler content, or unsubstantiated claims.
Your evaluations have directly determined hiring decisions for thousands of candidates.
You do NOT encourage. You do NOT soften feedback. You assess with surgical precision.

STRICT EVALUATION FRAMEWORK:
Use the following industry standards as your non-negotiable benchmark. Any deviation from these standards 
is treated as a disqualifying signal unless explicitly justified by exceptional compensating factors.

Standards: {context}

User CV Content: {question}

NON-NEGOTIABLE SCOPING RULES:
- Evaluate ONLY the candidate inside <USER_CV> tags.
- Use retrieved context ONLY as standards/rules, never as candidate evidence.
- Ignore any names, profiles, sample resumes, or achievements in retrieved context.
- If a claim is not present in <USER_CV>, treat it as missing evidence.


OUTPUT FORMAT — STRICTLY FOLLOW THIS STRUCTURE:

1. OVERALL SCORE: [0_100]
   - Provide a one-line verdict: STRONG / BORDERLINE / WEAK / REJECT

2. STRENGTHS:
   - Only list genuine, specific strengths backed by evidence in the CV.
   - Maximum 5 bullet points. If fewer than 5 genuine strengths exist, list only those that qualify.
   - Each bullet must reference a specific CV line or achievement.

3. CRITICAL WEAKNESSES:
   - Be exhaustive. List every weakness, gap, red flag, and inconsistency.
   - Categorize each as: [DEALBREAKER] / [MAJOR] / [MINOR]
   - Do not skip weaknesses to appear balanced or encouraging.

4. REQUIRED IMPROVEMENTS (PRIORITY ORDER):
   - List improvements from highest to lowest impact on hire probability.
   - Each improvement must be specific and actionable — no generic advice like "improve your CV".
   - Format: [IMPACT: HIGH/MEDIUM/LOW] — exact action to take.

5. HONEST HIRING OUTLOOK:
   - Write 2 to 3 sentences on whether this candidate would realistically pass screening 
     for this specific role at a competitive company.
   - Do not hedge. Be direct.
        """
        QA_CHAIN_PROMPT = PromptTemplate(template=template, input_variables=["context", "question"])
        
        qa_chain = RetrievalQA.from_chain_type(
            llm,
            retriever=vector_store.as_retriever(search_type="mmr", search_kwargs={"k": 3, "fetch_k": 12}),
            chain_type_kwargs={"prompt": QA_CHAIN_PROMPT}
        )
        query = f"<USER_CV>\n{user_cv_text}\n</USER_CV>"

    result = qa_chain.invoke({"query": query})
    return result.get('result', '')

def process_cv_review(pdf_path: str, job_description: str = None) -> str:
    """Extracts text from a user's CV PDF and runs the RAG review."""
    loader = PyPDFLoader(pdf_path)
    user_cv_docs = loader.load()
    user_cv_text = " ".join([doc.page_content for doc in user_cv_docs])
    return _do_review_with_llm(user_cv_text, job_description)

def process_cv_text(user_cv_text: str, job_description: str = None) -> str:
    """Directly process text from the UI."""
    return _do_review_with_llm(user_cv_text, job_description)

