"""Local retrieval for RAG.

The knowledge base is a folder of Markdown files split into sections. Retrieval
uses character n-gram TF-IDF, which handles Russian morphology well without an
external embedding service — everything runs offline.
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"


@dataclass(frozen=True)
class Chunk:
    id: str
    doc: str
    section: str
    text: str


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float

    def as_dict(self) -> dict:
        return {
            "id": self.chunk.id,
            "doc": self.chunk.doc,
            "section": self.chunk.section,
            "text": self.chunk.text,
            "score": round(self.score, 3),
        }


def split_markdown(name: str, text: str) -> list[Chunk]:
    lines = text.strip().splitlines()
    doc = lines[0].lstrip("# ").strip() if lines and lines[0].startswith("# ") else name
    chunks: list[Chunk] = []
    section, buf = "Обзор", []

    def flush() -> None:
        body = "\n".join(buf).strip()
        if body:
            chunks.append(Chunk(f"{name}#{len(chunks)}", doc, section, body))

    for line in lines[1:]:
        if line.startswith("## "):
            flush()
            section, buf = line[3:].strip(), []
        else:
            buf.append(line)
    flush()
    return chunks


class Retriever:
    def __init__(self, chunks: list[Chunk]) -> None:
        self.chunks = chunks
        self._vectorizer = TfidfVectorizer(
            analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True
        )
        corpus = [f"{c.doc} {c.section} {c.text}".lower() for c in chunks]
        self._matrix = self._vectorizer.fit_transform(corpus)

    def search(self, query: str, k: int = 3, min_score: float = 0.05) -> list[Hit]:
        if not query.strip():
            return []
        sims = cosine_similarity(self._vectorizer.transform([query.lower()]), self._matrix)[0]
        hits: list[Hit] = []
        seen_docs: set[str] = set()
        # Best section per document: k diverse sources beat k slices of the same one.
        for i in sims.argsort()[::-1]:
            if sims[i] < min_score or len(hits) == k:
                break
            if self.chunks[i].doc not in seen_docs:
                seen_docs.add(self.chunks[i].doc)
                hits.append(Hit(self.chunks[i], float(sims[i])))
        return hits

    def search_each(self, queries: list[str], k: int = 3) -> list[Hit]:
        """Best unseen document per query, in order — one source per signal."""
        hits: list[Hit] = []
        for q in queries:
            seen = {h.chunk.doc for h in hits}
            best = next(
                (h for h in self.search(q, k=len(self.chunks)) if h.chunk.doc not in seen), None
            )
            if best:
                hits.append(best)
            if len(hits) == k:
                break
        return hits


@lru_cache
def get_retriever() -> Retriever:
    chunks = [
        chunk
        for path in sorted(KNOWLEDGE_DIR.glob("*.md"))
        for chunk in split_markdown(path.stem, path.read_text(encoding="utf-8"))
    ]
    return Retriever(chunks)
