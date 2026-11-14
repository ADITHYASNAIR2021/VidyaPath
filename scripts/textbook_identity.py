"""Resolve textbook identity from content, never blindly from an edition-dependent filename."""
import re
import unicodedata
import math


def textbook_heading_text(pdf_path, fallback_text):
    """Read heading layout before cleaning/flattening body text can erase it."""
    try:
        import fitz
        with fitz.open(pdf_path) as document:
            heading = "\n".join(document.load_page(page).get_text() for page in range(min(8, len(document))))
        return heading if heading.strip() else fallback_text
    except Exception:
        return fallback_text


def normalize(value):
    value = unicodedata.normalize("NFKC", value).lower()
    return " ".join(re.findall(r"[a-z0-9]+|[\u0900-\u097f]+", value))


def match_textbook_chapter(text, class_level, subject, chapters):
    candidates = [chapter for chapter in chapters if int(chapter["classLevel"]) == class_level and (
        chapter["subject"] == subject or class_level == 10 and subject == "Science" and chapter["subject"] in ("Physics", "Chemistry", "Biology")
    )]
    heading = normalize(text[:6000])
    lines = [line.strip() for line in text[:8000].splitlines() if line.strip()]
    headings = []
    for line in lines[:160]:
        words = re.findall(r"[A-Za-z]+", line)
        letters = re.findall(r"[A-Za-z]", line)
        uppercase = sum(letter.isupper() for letter in letters) / max(1, len(letters))
        titlecase = sum(word[0].isupper() or word.lower() in {"and", "of", "the", "in"} for word in words) / max(1, len(words))
        if 1 <= len(words) <= 16 and (uppercase >= 0.65 or titlecase >= 0.8):
            headings.append(line)
    header = normalize(" ".join(headings))
    compact_header = header.replace(" ", "")
    header_matches = []
    for chapter in candidates:
        title = normalize(chapter["title"])
        position = compact_header.find(title.replace(" ", ""))
        if position >= 0:
            header_matches.append((position, -len(title), chapter))
    if header_matches:
        if len(header_matches) > 1 and all(chapter.get("topics") for _, _, chapter in header_matches):
            body = set(word.rstrip("s") for word in normalize(text[:30000]).split())
            stop = {"and", "the", "of", "in", "a", "an", "to", "with", "for", "by", "system", "process", "reproduction", "reproductive"}
            all_terms = {chapter["id"]: {word.rstrip("s") for topic in chapter.get("topics", []) for word in normalize(topic).split()} - stop for chapter in candidates}
            scores = []
            for position, _, chapter in header_matches:
                terms = all_terms[chapter["id"]]
                score = sum((1 + math.log((len(candidates) + 1) / (1 + sum(term in other for other in all_terms.values())))) for term in terms & body) / max(1, math.sqrt(len(terms)))
                scores.append((score, -position, chapter))
            scores.sort(key=lambda value: (value[0], value[1]), reverse=True)
            if scores[0][0] > scores[1][0] * 1.1:
                return scores[0][2], "heading-and-topic-support", 0.9
        header_matches.sort(key=lambda value: (value[0], value[1]))
        return header_matches[0][2], "heading-title", 0.99
    exact = []
    for chapter in candidates:
        title = normalize(chapter["title"])
        match = re.search(r"\b" + re.escape(title) + r"\b", heading)
        if match and match.start() < 120 and len(title.split()) > 1:
            exact.append((match.start(), -len(title), chapter))
    if exact:
        exact.sort(key=lambda value: (value[0], value[1]))
        position, _, chapter = exact[0]
        return chapter, "heading-title", 0.99 if position < 250 else 0.85
    # Decorative PDF headings may have no extractable text. A real section number
    # plus title vocabulary is safer than the filename's edition-dependent number.
    section = re.search(r"\b(\d{1,2})\s*\.\s*1\s+(?:Introduction|INTRODUCTION)", text[:1600])
    if section and subject != "Science":
        number = int(section.group(1))
        body_words = {word.rstrip("s") for word in heading[:4000].split()}
        matches = []
        for chapter in candidates:
            terms = set(normalize(chapter["title"]).split()) - {"and", "the", "of", "in", "introduction", "to", "some"}
            support = sum(term.rstrip("s") in body_words for term in terms) / max(1, len(terms))
            if chapter.get("chapterNumber") == number and support >= 0.5:
                matches.append(chapter)
        if len(matches) == 1:
            return matches[0], "section-number-and-title", 0.9
    # OCR spacing can break full phrases. Require substantial, unambiguous title overlap.
    words = set(header.split())
    ignored = {"and", "the", "of", "in", "a", "an", "to", "introduction", "applications", "application", "some", "basic", "concepts"}
    ranked = []
    for chapter in candidates:
        terms = set(normalize(chapter["title"]).split()) - ignored
        if len(terms) < 2:
            continue
        score = len(terms & words) / len(terms)
        if score >= 0.8 and any(len(term) >= 6 for term in terms & words):
            ranked.append((score, chapter))
    ranked.sort(key=lambda value: value[0], reverse=True)
    if ranked and (len(ranked) == 1 or ranked[0][0] - ranked[1][0] >= 0.2):
        return ranked[0][1], "title-token-match", 0.8
    if class_level == 10 and subject == "Science" and re.search(r"\bheredity\b", header):
        for chapter in candidates:
            if normalize(chapter["title"]) == "heredity and evolution":
                return chapter, "rationalized-heading-alias", 0.9
    return None, "unresolved-heading", 0.0
