with open("app/core/limiter.py", "r") as f:
    c = f.read()

# Revert limiter instantiation to default memory override for testability because Fastapi's pydantic baseSettings already initialized
# meaning it's caching memory:// or Redis URL early in the singleton.
c = c.replace("storage_uri=settings.REDIS_URL,", "storage_uri='memory://',")
with open("app/core/limiter.py", "w") as f:
    f.write(c)
