#!/usr/bin/env python3
"""Lightweight RAG evaluation for the resume reviewer knowledge base.

Generates synthetic queries from KB chunks, evaluates retrieval quality,
and optionally measures simple generation groundedness using the LLM.
Outputs a CSV file suitable for charting.
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Iterable, List, Tuple

from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter

REPO_ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("CHROMA_DB_DIR", str(REPO_ROOT / "app" / "data" / "chroma_db_eval"))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.services.review import (
    KNOWLEDGE_BASE_DIR,
    get_knowledge_base,
)

try:
    from langchain_groq import ChatGroq
except Exception:  # pragma: no cover - optional dependency at runtime
    ChatGroq = None


SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
WORD_RE = re.compile(r"[a-zA-Z0-9]+")


def _normalize_tokens(text: str) -> List[str]:
    return WORD_RE.findall(text.lower())


def _jaccard(a_tokens: Iterable[str], b_tokens: Iterable[str]) -> float:
    a_set = set(a_tokens)
    b_set = set(b_tokens)
    if not a_set or not b_set:
        return 0.0
    return len(a_set & b_set) / len(a_set | b_set)


def _chunk_overlap_ratio(a_tokens: Iterable[str], b_tokens: Iterable[str]) -> float:
    a_list = list(a_tokens)
    b_set = set(b_tokens)
    if not a_list:
        return 0.0
    return sum(1 for token in a_list if token in b_set) / len(a_list)


def _split_sentences(text: str) -> List[str]:
    sentences = [s.strip() for s in SENTENCE_RE.split(text) if s.strip()]
    return [s for s in sentences if len(s) >= 40]


def _load_chunks_from_kb() -> List[Document]:
    """Return chunk documents using the same splitter as the main app."""
    vector_store = get_knowledge_base()

    # Try to read raw documents directly from Chroma.
    try:
        store_data = vector_store.get(include=["documents", "metadatas"])
        docs = []
        for text, meta in zip(store_data.get("documents", []), store_data.get("metadatas", [])):
            docs.append(Document(page_content=text, metadata=meta or {}))
        if docs:
            return docs
    except Exception:
        pass

    # Fallback: reload PDFs and split.
    from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader

    loader = DirectoryLoader(
        KNOWLEDGE_BASE_DIR,
        glob="**/*.pdf",
        loader_cls=PyPDFLoader,
    )
    documents = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    return splitter.split_documents(documents)


def _build_dataset(chunks: List[Document], num_queries: int, seed: int) -> List[Tuple[str, str]]:
    """Return list of (query, source_text)."""
    random.seed(seed)
    candidates = [c for c in chunks if _split_sentences(c.page_content)]
    if not candidates:
        raise ValueError("No valid chunks found for query generation.")

    selected = random.sample(candidates, k=min(num_queries, len(candidates)))
    dataset: List[Tuple[str, str]] = []
    for chunk in selected:
        sentences = _split_sentences(chunk.page_content)
        sentence = random.choice(sentences)
        dataset.append((sentence, chunk.page_content))
    return dataset


def _get_retriever(vector_store, k: int, fetch_k: int):
    return vector_store.as_retriever(search_type="mmr", search_kwargs={"k": k, "fetch_k": fetch_k})


def _retrieval_hit(source_text: str, retrieved: List[Document]) -> Tuple[bool, int, float]:
    """Return (hit, rank, best_overlap). rank is 1-based or 0 if no hit."""
    source_tokens = _normalize_tokens(source_text)
    best_overlap = 0.0
    best_rank = 0
    hit = False
    for idx, doc in enumerate(retrieved, start=1):
        doc_tokens = _normalize_tokens(doc.page_content)
        overlap = _chunk_overlap_ratio(source_tokens, doc_tokens)
        best_overlap = max(best_overlap, overlap)
        if overlap >= 0.6 and not hit:
            hit = True
            best_rank = idx
    return hit, best_rank, best_overlap


def _build_llm():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key or ChatGroq is None:
        return None
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.0,
        groq_api_key=api_key,
        max_tokens=512,
    )


def _answer_with_context(llm, query: str, context_docs: List[Document]) -> str:
    context = "\n\n".join(doc.page_content for doc in context_docs)
    prompt = (
        "Use only the context to answer the question. "
        "If the answer is not in the context, reply with INSUFFICIENT_CONTEXT.\n\n"
        f"Context:\n{context}\n\nQuestion: {query}\nAnswer:"
    )
    response = llm.invoke(prompt)
    return response.content.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate RAG retrieval and groundedness.")
    parser.add_argument("--num-queries", type=int, default=20)
    parser.add_argument("--k", type=int, default=3)
    parser.add_argument("--fetch-k", type=int, default=12)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--mode", choices=["retrieval", "generation", "both"], default="both")
    parser.add_argument("--csv", default="rag_eval_metrics.csv")
    args = parser.parse_args()

    vector_store = get_knowledge_base()
    chunks = _load_chunks_from_kb()
    dataset = _build_dataset(chunks, args.num_queries, args.seed)
    retriever = _get_retriever(vector_store, args.k, args.fetch_k)

    llm = _build_llm() if args.mode in {"generation", "both"} else None

    rows = []
    hits = 0
    mrr_total = 0.0
    retrieval_latencies = []
    gen_latencies = []
    answer_coverages = []

    for idx, (query, source_text) in enumerate(dataset, start=1):
        start = time.perf_counter()
        retrieved = retriever.get_relevant_documents(query)
        retrieval_ms = (time.perf_counter() - start) * 1000

        hit, rank, overlap = _retrieval_hit(source_text, retrieved)
        hits += 1 if hit else 0
        if rank > 0:
            mrr_total += 1.0 / rank
        retrieval_latencies.append(retrieval_ms)

        answer = ""
        answer_coverage = ""
        gen_ms = ""
        if llm is not None:
            gen_start = time.perf_counter()
            answer = _answer_with_context(llm, query, retrieved)
            gen_ms = (time.perf_counter() - gen_start) * 1000
            gen_latencies.append(gen_ms)
            answer_tokens = _normalize_tokens(answer)
            context_tokens = _normalize_tokens(" ".join(d.page_content for d in retrieved))
            if answer_tokens:
                coverage = _chunk_overlap_ratio(answer_tokens, context_tokens)
                answer_coverage = f"{coverage:.3f}"
                answer_coverages.append(coverage)

        rows.append(
            {
                "query_id": idx,
                "query": query,
                "hit": int(hit),
                "rank": rank,
                "overlap": f"{overlap:.3f}",
                "retrieval_ms": f"{retrieval_ms:.2f}",
                "answer_coverage": answer_coverage,
                "generation_ms": f"{gen_ms:.2f}" if gen_ms != "" else "",
                "answer": answer,
            }
        )

    total = len(dataset)
    recall_at_k = hits / total if total else 0.0
    mrr = mrr_total / total if total else 0.0
    avg_retrieval_ms = sum(retrieval_latencies) / len(retrieval_latencies)
    avg_gen_ms = sum(gen_latencies) / len(gen_latencies) if gen_latencies else 0.0
    avg_answer_cov = sum(answer_coverages) / len(answer_coverages) if answer_coverages else 0.0

    with open(args.csv, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print("RAG evaluation complete")
    print(f"queries: {total}")
    print(f"recall@{args.k}: {recall_at_k:.3f}")
    print(f"mrr: {mrr:.3f}")
    print(f"avg_retrieval_ms: {avg_retrieval_ms:.2f}")
    if llm is not None:
        print(f"avg_generation_ms: {avg_gen_ms:.2f}")
        print(f"avg_answer_coverage: {avg_answer_cov:.3f}")
    print(f"csv: {args.csv}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
