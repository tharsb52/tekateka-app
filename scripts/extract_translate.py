"""
Dev tool: extract every French UI string from the Expo app (and backend error
messages) and machine-translate them to English with an LLM.

Output: /app/frontend/i18n/en-auto.json  ({ "French text": "English text" })
Strings with dynamic parts use numbered placeholders: "{0} jours restants".

Usage:  python3 scripts/extract_translate.py            (only new strings)
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path("/app/frontend")
OUT = ROOT / "i18n" / "en-auto.json"
SRC_DIRS = ["app", "components", "context", "services", "utils"]
BACKEND = Path("/app/backend")

LETTER = re.compile(r"[A-Za-zÀ-ÿ]")
FRENCHY = re.compile(r"[àâçéèêëîïôûùüÿœÀÂÇÉÈÊËÎÏÔÛÙÜŸŒ]|\b(le|la|les|des|du|de|un|une|votre|vos|mon|ma|mes|et|ou|pour|avec|sur|aucun|aucune|est|sont|pas|dans|au|aux|en)\b", re.I)


def unescape(s: str) -> str:
    return s.replace("\\n", "\n").replace("\\'", "'").replace('\\"', '"').replace("\\`", "`")


def keep(s: str) -> bool:
    t = s.strip()
    if len(t) < 2 or len(t) > 400 or not LETTER.search(t):
        return False
    if t.startswith(("@", "#", "http", "./", "../", "/", "rgba", "data:")) or "://" in t:
        return False
    if re.fullmatch(r"[a-z0-9_\-.]+", t):  # identifiers, icon names, style values
        return False
    if re.fullmatch(r"[A-Z0-9_]+", t) and len(t) > 1 and t not in ("SUPPRIMER",):
        return False
    if re.search(r"\b(import|require|export|function|const)\b", t):
        return False
    # Single word: only if capitalised French-looking word
    if " " not in t and not FRENCHY.search(t) and not re.fullmatch(r"[A-ZÀ-Ý][a-zà-ÿ'’]+[!?.:]?", t):
        return False
    return True


def extract_file(text: str) -> set:
    found = set()
    # JSX text nodes
    for m in re.finditer(r"[>}]([^<>{}`]+?)(?=[<{])", text):
        s = " ".join(m.group(1).split())
        # JSX text: relaxed filter (all-caps headers, "Achat/u", "produit(s)")
        if LETTER.search(s) and len(s) < 400 and not re.search(r"=>|;|&&|\|\||\b(const|return|import)\b|^\)|\($", s) \
                and not re.fullmatch(r"[a-z0-9_\-.]+", s):
            found.add(s)
    # quoted literals
    for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"", text):
        s = unescape(m.group(1) if m.group(1) is not None else m.group(2))
        if keep(s):
            found.add(s)
    # template literals → placeholders
    for m in re.finditer(r"`((?:[^`\\]|\\.)*)`", text):
        raw = m.group(1)
        if "\n" in raw and len(raw) > 400:
            continue
        i = [0]

        def ph(_):
            r = "{%d}" % i[0]
            i[0] += 1
            return r
        s = unescape(re.sub(r"\$\{[^}]*\}", ph, raw))
        if keep(re.sub(r"\{\d+\}", "", s)) and " " in s:
            found.add(s)
    return found


def collect() -> list:
    strings = set()
    for d in SRC_DIRS:
        for p in (ROOT / d).rglob("*.ts*"):
            if "en-auto" in p.name or p.name == "translations.ts":
                continue
            strings |= extract_file(p.read_text(encoding="utf-8"))
    for p in BACKEND.glob("*.py"):
        txt = p.read_text(encoding="utf-8")
        for m in re.finditer(r'(?:detail|"message"|"error")\s*[=:]\s*f?"((?:[^"\\\n]|\\.)*)"', txt):
            s = re.sub(r"\{[^}]*\}", "{0}", m.group(1))
            if keep(s):
                strings.add(unescape(s))
    return sorted(strings)


SYSTEM = (
    "You translate the user interface of 'TekaTeka', a mobile business app for small merchants in Africa, "
    "from French to English. You receive a JSON array of strings. Return ONLY a JSON object mapping each "
    "input string (exactly as given) to its natural, concise English UI translation. Rules: keep placeholders "
    "like {0} {1} exactly; keep emojis, punctuation style, leading/trailing spaces and line breaks; keep brand "
    "names (TekaTeka, Stripe, WhatsApp, Mobile Money, Gmail) and currency codes; keep person names. If a string "
    "is not French UI text (code, identifier, already English), return it unchanged. Keep 'SUPPRIMER' as 'DELETE'."
)


async def translate_batch(chat_factory, batch):
    from emergentintegrations.llm.chat import UserMessage
    for attempt in range(3):
        try:
            chat = chat_factory()
            resp = await chat.send_message(UserMessage(text=json.dumps(batch, ensure_ascii=False)))
            txt = resp.strip()
            txt = txt[txt.index("{"): txt.rindex("}") + 1]
            data = json.loads(txt)
            return {k: v for k, v in data.items() if isinstance(v, str)}
        except Exception as e:
            print("batch failed", attempt, e, file=sys.stderr)
    return {}


async def main():
    from emergentintegrations.llm.chat import LlmChat
    key = os.environ["EMERGENT_LLM_KEY"]
    existing = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [s for s in collect() if s not in existing]
    print(f"{len(todo)} new strings to translate", flush=True)

    def factory():
        return LlmChat(api_key=key, session_id=os.urandom(6).hex(), system_message=SYSTEM).with_model("openai", "gpt-4.1")

    batches = [todo[i:i + 80] for i in range(0, len(todo), 80)]
    sem = asyncio.Semaphore(6)

    async def run(b):
        async with sem:
            r = await translate_batch(factory, b)
            print(f"batch done {len(r)}/{len(b)}", flush=True)
            return r

    for r in await asyncio.gather(*(run(b) for b in batches)):
        existing.update(r)
    OUT.write_text(json.dumps(dict(sorted(existing.items())), ensure_ascii=False, indent=1), encoding="utf-8")
    print("total", len(existing))


if __name__ == "__main__":
    if "--count" in sys.argv:
        s = collect()
        print(len(s))
        print("\n".join(s[:: max(1, len(s) // 60)]))
    else:
        asyncio.run(main())
