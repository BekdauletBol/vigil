from app.ai.retriever import get_retriever, split_markdown


def test_split_markdown_into_sections():
    chunks = split_markdown("doc", "# Title\n\nIntro text\n\n## A\nalpha\n\n## B\nbeta\n")
    assert [c.section for c in chunks] == ["Обзор", "A", "B"]
    assert all(c.doc == "Title" for c in chunks)


def test_search_finds_structuring_for_russian_query():
    hits = get_retriever().search("клиент делит сумму на части ниже порога, дробление", k=3)
    assert hits
    assert "Дробление" in hits[0].chunk.doc


def test_search_finds_crypto_doc():
    hits = get_retriever().search("перевод на криптобиржу", k=1)
    assert "виртуальными активами" in hits[0].chunk.doc


def test_search_each_gives_one_source_per_signal():
    hits = get_retriever().search_each(
        ["Операция выше порогового значения", "Офшорная юрисдикция", "Высокая частота операций"]
    )
    docs = [h.chunk.doc for h in hits]
    assert len(set(docs)) == 3
    assert any("офшорными" in d for d in docs)


def test_empty_query_returns_nothing():
    assert get_retriever().search("   ") == []


def test_results_come_from_distinct_documents():
    hits = get_retriever().search("операция выше порога, перевод в офшор, дробление", k=3)
    assert len({h.chunk.doc for h in hits}) == len(hits) == 3
