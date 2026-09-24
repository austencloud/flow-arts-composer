# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
"""Mechanical pre-pass for the ai-bust skill.

Reports AI-writing tells that can be matched without judgment. Stdlib only.

Usage:
    python ai_bust.py FILE [FILE ...]
    cat file.md | python ai_bust.py -
    python ai_bust.py --json FILE
    python ai_bust.py --email draft.txt          (plain text or HTML email body)

Output: FILE:LINE | PATTERN | quoted text | fix
Exit code 1 if any finding, 0 if clean.
"""

import argparse
import json
import re
import statistics
import sys
from html import unescape

# ---------------------------------------------------------------- line rules
# (pattern name, compiled regex, fix, severity)
R = re.IGNORECASE


def rules():
    v = [
        ("em dash", re.compile(r"[—–]"), "use a comma, a period, or a colon", "CRITICAL"),
        ("emoji", re.compile(
            "[\U0001F300-\U0001FAFF\U00002600-\U000027BF"
            "\U00002B00-\U00002BFF\U0001F000-\U0001F0FF️✅❌❤]"),
            "delete it", "CRITICAL"),
    ]

    blacklist = [
        # abstract-noun filler
        "tapestry", "landscape", "realm", "ecosystem", "paradigm", "nuances?",
        "at its core", "in essence", "journey",
        # vague-value adjectives
        "robust", "comprehensive", "crucial", "pivotal", "seamless(?:ly)?",
        "cutting[- ]edge", "game[- ]changing", "next[- ]level", "holistic",
        "multifaceted", "curated", "intentional", "thoughtful", "meaningful",
        "vibrant", "bustling", "breathtaking", "nestled",
        # inflated verbs
        "delve", "leverag(?:e|ing|es)", "harness(?:ing|es)?", "unlock(?:ing|s)?",
        "foster(?:ing|s)?", "streamlin(?:e|ing|es)", "empower(?:ing|s)?",
        "utiliz(?:e|ing|es)", "spearhead(?:ing|s)?", "revolutioniz(?:e|ing|es)",
        "showcas(?:e|ing|es)", "underscor(?:e|ing|es)", "elevat(?:e|ing|es)",
        "resonat(?:e|ing|es)", "navigat(?:e|ing|es) (?:the |these |challenges|complexit)",
        "drive innovation", "highlight the importance of",
        # marketing
        "revolutionary", "effortlessly", "transformative", "unparalleled",
        "world[- ]class", "state of the art",
        # metaphor verbs
        "weaving together", "painting a picture", "crafting (?:your|a|an)",
        # free-floating intensifiers
        "quietly (?:orchestrat|transform|reshap|power)",
        "fundamentally (?:reshap|chang|transform)",
    ]
    for w in blacklist:
        v.append(("blacklisted word", re.compile(r"\b(" + w + r")\b", R),
                  "name the specific thing instead", "HIGH"))

    phrase_rules = [
        ("banned opener", r"(?:^|(?<=[.!?]\s))In (?:today's|an era|the ever-evolving|the realm|the world) [^.]{0,60}",
         "cut the opener, start with the content", "CRITICAL"),
        ("banned opener", r"(?:^|(?<=[.!?]\s))(?:In the age of|As we navigate|In a world where)\b",
         "cut the opener, start with the content", "CRITICAL"),
        ("hedging", r"\b(?:it(?:'s| is) worth noting|it(?:'s| is) important to (?:note|remember)|"
                    r"that said|needless to say|at the end of the day)\b",
         "delete the hedge, keep the fact", "HIGH"),
        ("robotic transition", r"(?:^|(?<=[.!?]\s))(?:Furthermore|Moreover|Additionally|In conclusion|"
                               r"To sum up|In summary|Ultimately)\b",
         "cut the transition or use a plain one", "HIGH"),
        ("metadiscourse label", r"\b(?:the key takeaway is|in other words|what this means is|"
                                r"the bottom line is|simply put)\b",
         "delete the label, keep the claim", "HIGH"),
        ("sycophantic opener", r"(?:^|(?<=[.!?]\s))(?:Absolutely|Certainly|Great question|"
                               r"Excellent question|You(?:'re| are) absolutely right|"
                               r"That(?:'s| is) a great point)\b",
         "delete the affirmation, answer directly", "HIGH"),
        ("faux intimacy", r"\b(?:here(?:'s| is) the (?:thing|kicker|catch)|let(?:'s| us) (?:unpack|break this down)|"
                          r"here(?:'s| is) an uncomfortable truth)\b",
         "cut it, let the next sentence stand alone", "HIGH"),
        ("dressed-up copula", r"\b(?:serves? as|stands? as|acts? as|functions? as|represents|"
                              r"is a testament to|boasts)\b",
         "use is or has", "MEDIUM"),
        ("negative parallelism", r"\b(?:it(?:'s| is)|this is|they(?:'re| are))? ?not (?:just |merely |only )?"
                                 r"(?:about )?[^.,;]{2,50}[,.] (?:it(?:'s| is)|this is|but)\b",
         "state the real claim once, directly", "HIGH"),
        ("negative parallelism", r"(?:^|(?<=[.!?]\s))Not (?:a|an|the|just)\b[^.!?]{2,40}\. Not\b",
         "state the conclusion, cut the setup", "HIGH"),
        ("weasel attribution", r"\b(?:experts? (?:agree|say)|studies show|research shows|"
                               r"industry reports?|it(?:'s| is) widely (?:known|believed)|"
                               r"many (?:believe|argue)|some would say)\b",
         "name the source or cut the claim", "HIGH"),
        ("boilerplate ending", r"\bWhether you(?:'re| are)\b",
         "pick the actual audience and address them", "CRITICAL"),
        ("boilerplate ending", r"\b(?:let me know if|feel free to|happy to help|"
                               r"I hope this helps|don(?:'t| not) hesitate to)\b",
         "end on the content, drop the service closer", "HIGH"),
        ("wh-cleft opener", r"(?:^|(?<=[.!?]\s))What (?:makes|made|sets|set) (?:this|that|it|them|these)"
                            r"[^.!?]{0,40}\b(?:is|was|are|were)\b",
         "delete the scaffold, start with the actual point", "MEDIUM"),
        ("acknowledge-then-dismiss", r"\bDespite (?:its|these|the) (?:challenges|drawbacks|limitations)\b",
         "detail the challenge and its real resolution, or cut the beat", "MEDIUM"),
        ("counting before a list", r"\bthere are (?:two|three|four|five|\d+) (?:reasons|ways|things|factors|"
                                   r"steps|key|main)\b",
         "just list them, drop the count", "MEDIUM"),
        ("unicode decoration", r"[→←⇒•](?=\s)",
         "write the word out", "MEDIUM"),
        ("smart quote", r"[‘’“”]",
         "use straight quotes", "LOW"),
        ("unearned stakes", r"\b(?:fundamentally reshape|change everything|"
                            r"a new era of|the future of \w+ is)\b",
         "scale the claim to the evidence", "MEDIUM"),
        ("false range", r"\bfrom [\w\s]{2,25} to [\w\s]{2,25} to [\w\s]{2,25}\b",
         "list the actual items, do not fake a continuum", "LOW"),
    ]
    for name, pat, fix, sev in phrase_rules:
        v.append((name, re.compile(pat, R), fix, sev))
    return v


RULES = rules()

# Only the stock setup phrases. A bare "Label: value" line is note syntax, not a reveal.
COLON_REVEAL = re.compile(
    r"(?:^|(?<=[.!?]\s))((?:here(?:'s| is) (?:the|why|what)|"
    r"(?:and |but )?the (?:best part|worst part|result|kicker|catch|twist|upshot|"
    r"real (?:problem|question|reason)|bottom line)|"
    r"one (?:more )?thing)\s*:\s+)([^.!?\n]{3,70}[.!?])", R)

SIGNPOST = re.compile(
    r"^(?:\*\*)?(?:For|Since|If|While|When|Although|Because|Given|With|After|Once|As|Beyond|Between)"
    r"\b[^,.]{0,60},\s", R)

PERFECT_THREE = re.compile(
    r"\b([\w-]+),\s+([\w-]+),\s+and\s+([\w-]+)(?=\s*[.,;:)!?]|\s*$)")

SENT_SPLIT = re.compile(r"(?<=[.!?])[\s\n]+")
WORD = re.compile(r"[A-Za-z0-9'’-]+")
FENCE = re.compile(r"^\s*(```|~~~)")


def strip_code(lines):
    """Return list of (lineno, text) with fenced code blocks blanked out."""
    out = []
    in_fence = False
    for i, raw in enumerate(lines, 1):
        if FENCE.match(raw):
            in_fence = not in_fence
            out.append((i, ""))
            continue
        out.append((i, "" if in_fence else raw))
    return out


def snippet(text, start, end, width=90):
    lo = max(0, start - 20)
    hi = min(len(text), end + 30)
    s = text[lo:hi].strip()
    if len(s) > width:
        s = s[:width].rstrip() + "..."
    return " ".join(s.split())


def scan_lines(path, body):
    found = []
    for lineno, text in body:
        if not text.strip():
            continue
        for name, rx, fix, sev in RULES:
            for m in rx.finditer(text):
                label = name
                if name == "blacklisted word":
                    label = "blacklisted word: %s" % m.group(1).lower()
                found.append(dict(file=path, line=lineno, pattern=label, severity=sev,
                                  text=snippet(text, m.start(), m.end()), fix=fix))
        for m in COLON_REVEAL.finditer(text):
            found.append(dict(file=path, line=lineno, pattern="colon reveal", severity="MEDIUM",
                              text=snippet(text, m.start(), m.end()),
                              fix="drop the setup phrase and the colon, state the claim"))
        for m in PERFECT_THREE.finditer(text):
            found.append(dict(file=path, line=lineno, pattern="perfect three", severity="MEDIUM",
                              text=snippet(text, m.start(), m.end()),
                              fix="cut to two items or break the rhythm"))
    return found


def scan_question_fragment(path, body):
    """A question followed by a very short declarative answer."""
    found = []
    for lineno, text in body:
        parts = [p for p in SENT_SPLIT.split(text.strip()) if p]
        for a, b in zip(parts, parts[1:]):
            if a.rstrip().endswith("?") and 0 < len(WORD.findall(b)) <= 4:
                found.append(dict(file=path, line=lineno, pattern="question then fragment",
                                  severity="MEDIUM", text=" ".join((a + " " + b).split())[:90],
                                  fix="state the answer as a sentence, delete the question"))
    return found


def paragraphs(body):
    """Group non-blank lines into (start_line, joined_text) paragraphs."""
    out, buf, start = [], [], None
    for lineno, text in body:
        if text.strip():
            if start is None:
                start = lineno
            buf.append(text.strip())
        elif buf:
            out.append((start, " ".join(buf)))
            buf, start = [], None
    if buf:
        out.append((start, " ".join(buf)))
    return out


def scan_signposts(path, paras):
    found, run = [], []
    for start, text in paras:
        body = re.sub(r"^[#>\-*\d.\s]+", "", text)
        if SIGNPOST.match(body):
            run.append((start, body))
        else:
            run = []
        if len(run) >= 3:
            for start2, body2 in run:
                found.append(dict(file=path, line=start2, pattern="signpost paragraph opener",
                                  severity="MEDIUM", text=body2[:70],
                                  fix="JUDGMENT: cut the connective, start with the content"))
            run = []
    return found


BOLD_BULLET = re.compile(r"^\s*(?:(?:[-*+]|\d+[.)])\s+)?\*\*[^*]{1,40}\*\*\s*[:.]")
HEADING = re.compile(r"^\s*#{1,6}\s+\S")


def scan_bold_bullets(path, body):
    """A run of 3+ list items that all open with a bold label."""
    found, run = [], []

    def flush():
        if len(run) >= 3:
            found.append(dict(file=path, line=run[0], pattern="bold-first bullets",
                              severity="MEDIUM", text="%d bullets from line %d" % (len(run), run[0]),
                              fix="bold only the item that needs emphasis, or drop bold"))

    for lineno, text in body:
        if BOLD_BULLET.match(text):
            run.append(lineno)
        elif text.strip():
            flush()
            run = []
    flush()
    return found


def scan_short_sections(path, body, min_words=40):
    """A heading whose section holds fewer than min_words before the next heading."""
    found, cur, words = [], None, 0

    def flush():
        if cur is not None and words < min_words:
            found.append(dict(file=path, line=cur[0], pattern="header on short text",
                              severity="LOW", text="%s (%d words)" % (cur[1][:60], words),
                              fix="JUDGMENT: drop the heading, fold the text into prose"))

    for lineno, text in body:
        if HEADING.match(text):
            flush()
            cur, words = (lineno, text.strip()), 0
        elif cur is not None:
            words += len(WORD.findall(text))
    flush()
    return found


def burstiness(path, body):
    text = " ".join(t for _, t in body)
    text = re.sub(r"[#>*`|_\[\]()]", " ", text)
    lengths = [len(WORD.findall(s)) for s in SENT_SPLIT.split(text)]
    lengths = [n for n in lengths if n >= 3]
    if len(lengths) < 6:
        return []
    sd = statistics.pstdev(lengths)
    mean = statistics.fmean(lengths)
    # Short note-style sentences are naturally uniform. The tell is 12-25 word
    # sentences that never vary.
    if mean >= 12.0 and sd < 5.0:
        return [dict(file=path, line=1, pattern="low burstiness", severity="MEDIUM",
                     text="%d sentences, mean %.1f words, stdev %.1f" % (len(lengths), mean, sd),
                     fix="JUDGMENT: vary sentence length, human prose usually runs stdev above 6")]
    return []


def scan(path, content):
    lines = content.splitlines()
    body = strip_code(lines)
    paras = paragraphs(body)
    found = []
    found += scan_lines(path, body)
    found += scan_question_fragment(path, body)
    found += scan_signposts(path, paras)
    found += scan_bold_bullets(path, body)
    found += scan_short_sections(path, body)
    found += burstiness(path, body)
    found.sort(key=lambda f: (f["line"], f["pattern"]))
    return found


# ---------------------------------------------------------------- email mode
# An email body is judged on how it renders in the recipient's client, so the
# body is flattened from HTML, the quoted history and signature are set aside,
# and the formatting tells that make a message look machine-written are added.

HTML_HINT = re.compile(r"<(?:div|p|br|span|table|blockquote|a)\b", R)
QUOTE_START = re.compile(r"^\s*On\b.{5,200}\bwrote:\s*$")
FORWARD_START = re.compile(r"^\s*-{2,}\s*(?:Original|Forwarded) message", R)
SIG_DELIM = re.compile(r"^--\s*$")
LIST_ITEM = re.compile(r"^\s*(?:[-*+•]|\d+[.)])\s+")
SIGNOFF = re.compile(r"^(?:best|thanks|thank you|cheers|talk soon|sincerely|regards|warmly|"
                     r"warm regards|all the best|take care|see you)\b[^.!?]{0,25}[,!.]?$", R)
MARKDOWN = re.compile(r"\*\*[^*\n]+\*\*|__[^_\n]+__|^\s*#{1,6}\s+\S|\[[^\]\n]+\]\([^)\s]+\)")
WRAP_MIN = 40


def html_to_text(html):
    """Flatten an HTML email body to the lines a reader sees, minus quoted history."""
    html = re.sub(r"<(style|script)\b.*?</\1>", "", html, flags=re.S | R)
    html = re.sub(r"<div[^>]*\bgmail_quote\b.*", "", html, flags=re.S | R)
    html = re.sub(r"<blockquote\b.*", "", html, flags=re.S | R)
    html = re.sub(r"\s*\n\s*", " ", html)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=R)
    html = re.sub(r"</(?:div|p|li|tr|h[1-6])>", "\n", html, flags=R)
    text = unescape(re.sub(r"<[^>]+>", "", html)).replace(" ", " ")
    text = "\n".join(line.strip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def split_email(text):
    """Return (body, signature) as lists of (lineno, text), stopping at quoted history."""
    body, sig, in_sig = [], [], False
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip()
        if QUOTE_START.match(line) or FORWARD_START.match(line):
            break
        if line.lstrip().startswith(">"):
            continue
        if SIG_DELIM.match(line):
            in_sig = True
            continue
        (sig if in_sig else body).append((lineno, line))
    return body, sig


def scan_hard_wraps(path, body):
    """Paragraph text broken across lines the way a 70-column plain-text mailer breaks it."""
    found = []
    reported = set()
    para = 0
    for (n, a), (_, b) in zip(body, body[1:]):
        a_s, b_s = a.strip(), b.strip()
        if not a_s:
            para += 1
            continue
        if not b_s or para in reported or LIST_ITEM.match(a) or LIST_ITEM.match(b):
            continue
        if len(a_s) < WRAP_MIN:
            continue
        if a_s[-1] in ".!?:" and not b_s[0].islower():
            continue
        reported.add(para)
        found.append(dict(file=path, line=n, pattern="hard-wrapped line", severity="CRITICAL",
                          text="...%s / %s..." % (a_s[-35:], b_s[:25]),
                          fix="put each paragraph on one line (or in one <div>) and let the mail client wrap"))
    return found


def scan_email(path, content, require_contact=None):
    """Email formatting checks plus the normal pass, on the part of the message the sender wrote."""
    text = html_to_text(content) if HTML_HINT.search(content) else content
    body, sig = split_email(text)
    found = scan(path, "\n".join(t for _, t in body))
    found += scan_hard_wraps(path, body)

    for lineno, line in body:
        for m in MARKDOWN.finditer(line):
            found.append(dict(file=path, line=lineno, pattern="markdown in email", severity="HIGH",
                              text=snippet(line, m.start(), m.end()),
                              fix="strip the markup; the recipient sees the raw asterisks and brackets"))

    written = [(n, t.strip()) for n, t in body if t.strip()]
    if written and not sig and not any(SIGNOFF.match(t) for _, t in written[-4:]):
        found.append(dict(file=path, line=written[-1][0], pattern="no sign-off", severity="HIGH",
                          text=written[-1][1][:60],
                          fix="end with a sign-off and the sender's name, or include the signature"))

    if require_contact and written:
        everything = "\n".join(t for _, t in body + sig)
        if not re.search(require_contact, everything):
            found.append(dict(file=path, line=written[-1][0], pattern="no contact line", severity="MEDIUM",
                              text=written[-1][1][:60],
                              fix="add the phone number under the name, or include the signature"))

    found.sort(key=lambda f: (f["line"], f["pattern"]))
    return found


ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Mechanical AI-writing tell scanner.")
    ap.add_argument("files", nargs="+", help="file paths, or - for stdin")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument("--min-severity", default="LOW", choices=list(ORDER))
    ap.add_argument("--email", action="store_true",
                    help="treat input as an email body (plain text or HTML): adds hard-wrap, "
                         "sign-off, and markdown checks and skips quoted history")
    ap.add_argument("--require-contact", metavar="REGEX",
                    help="with --email, flag a message whose body and signature lack this pattern")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    all_found = []
    for path in args.files:
        if path == "-":
            content, label = sys.stdin.read(), "<stdin>"
        else:
            with open(path, encoding="utf-8", errors="replace") as fh:
                content = fh.read()
            label = path
        if args.email:
            all_found += scan_email(label, content, args.require_contact)
        else:
            all_found += scan(label, content)

    cutoff = ORDER[args.min_severity]
    all_found = [f for f in all_found if ORDER[f["severity"]] <= cutoff]

    if args.json:
        print(json.dumps(all_found, indent=2))
        return 1 if all_found else 0

    for f in all_found:
        print("%s:%d | %s [%s] | \"%s\" | %s"
              % (f["file"], f["line"], f["pattern"], f["severity"], f["text"], f["fix"]))
    counts = {}
    for f in all_found:
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    if not all_found:
        print("clean: no mechanical tells found")
    else:
        print("\n%d finding(s): %s" % (len(all_found),
              ", ".join("%s %d" % (k, counts[k]) for k in ORDER if k in counts)))
    return 1 if all_found else 0


if __name__ == "__main__":
    sys.exit(main())
