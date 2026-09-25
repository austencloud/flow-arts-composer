# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
"""Mechanical pre-pass for the ai-bust skill.

Reports AI-writing tells that can be matched without judgment. Stdlib only.

Usage:
    python ai_bust.py FILE [FILE ...]
    cat file.md | python ai_bust.py -
    python ai_bust.py --json FILE
    python ai_bust.py --email draft.txt          (plain text or HTML email body)
    python ai_bust.py --self-test

Markdown and plain text are scanned as prose. Svelte, HTML, Vue, Astro, JSX, and
TSX files are read as markup: the text a visitor sees plus prose string literals
in <script>, with line numbers kept. JS, TS, and Python files contribute only
their prose string literals. Pass sibling pages in one run so the cross-page
checks can compare them.

Severity: CRITICAL is a machine artifact or a house ban. HIGH is a pattern that
shows up far more often in model output than in human prose. MEDIUM matters
when it recurs or clusters. LOW is a weak signal. A fix that starts with
JUDGMENT: is a hint for the reviewer, not a verdict.

Output: FILE:LINE | PATTERN [SEVERITY] | "quoted text" | fix
Exit code 1 if any finding, 0 if clean.
"""

import argparse
import bisect
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from html import unescape

R = re.IGNORECASE
# Start of a sentence inside a joined paragraph.
SS = r"(?:^|(?<=[.!?]\s)|(?<=[.!?][\"')’”]\s))"

# ---------------------------------------------------------------- phrase rules
# (pattern name, compiled regex, fix, severity). Each rule runs on whole
# paragraphs, so a phrase that wraps across lines still matches.


def rules():
    v = [
        ("em dash", re.compile(r"—|(?<=\s)–|–(?=\s)"), "use a comma, a period, or a colon", "CRITICAL"),
        ("emoji", re.compile(
            "[\U0001F300-\U0001FAFF\U00002600-\U000027BF"
            "\U00002B00-\U00002BFF\U0001F000-\U0001F0FF️✅❌❤]"),
            "delete it", "CRITICAL"),
    ]

    blacklist = [
        # abstract-noun filler
        "tapestry", "realm", "ecosystem", "paradigm", "nuances?", "at its core", "in essence",
        r"(?<!in )(?<!to )landscape(?! (?:mode|orientation|layout|view|viewports?|photos?|images?|format|"
        r"aspect|screens?|phones?|tablets?|devices?|breakpoints?))",
        r"(?<!user )(?<!customer )journey",
        # vague-value adjectives
        "robust", "comprehensive", "crucial", "pivotal", "seamless(?:ly)?",
        "cutting[- ]edge", "game[- ]changing", "next-level|to the next level", "holistic",
        "multifaceted", "curated", "intentional", "thoughtful",
        r"meaningful(?= (?:impact|change|difference|ways?|connections?|insights?|progress|engagement|"
        r"experiences?|conversations?|work|results?|value|contributions?|relationships?|moments?|outcomes?|steps?))",
        "vibrant", "bustling", "breathtaking", "nestled", "groundbreaking", "unwavering", "indelible",
        "commendable", "meticulous(?:ly)?",
        # inflated verbs
        "delv(?:e|es|ed|ing)", "leverag(?:e|ing|es)",
        r"harnessing|harness(?:e[sd])?(?= (?:the|its|their|your|our)\b)",
        "unlock(?:ing|s)?", "foster(?:ing|s|ed)?", "streamlin(?:e|ing|es)", "empower(?:ing|s)?",
        "utiliz(?:e|ing|es)", "spearhead(?:ing|s)?", "revolutioniz(?:e|ing|es)",
        "showcas(?:e|ing|es|ed)", "elevat(?:e|ing|es)",
        # the verb only; "an underscore" is a character
        r"underscoring|underscore[sd]?(?= (?:the|a|an|how|why|what|its|their|our|this|that|his|her)\b)",
        "resonat(?:e|ing|es)", "navigat(?:e|ing|es) (?:the |these |challenges|complexit)",
        "bolster(?:s|ed|ing)?", "garner(?:s|ed|ing)?",
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
        # -- chatbot residue: never in human prose
        ("chatbot artifact",
         r"\bas an AI (?:language model|assistant|model|chatbot|system)\b|\bas an AI,|\bas a large language model\b|"
         r"\bas of my (?:last |latest |most recent )?(?:knowledge (?:cutoff|cut-off|update)|training(?: data| cutoff)?|update)\b|"
         r"\bmy (?:knowledge|training) (?:cutoff|cut-off)\b|\bI (?:don't|do not|cannot|can't) (?:browse|access) the (?:internet|web)\b",
         "delete it; the model is talking about itself", "CRITICAL"),
        ("chatbot artifact",
         r"oaicite|contentReference\[|\bturn\d+(?:search|view|news|image|file|fetch)\d+\b|grok_render_\w+|"
         r"ppl-ai-file-upload|\[cite(?:_start|_end)?\]|\[cite:\s*[\d,\s]+\]|【\d+(?:†[^】]{0,40})?】|"
         r"utm_source=(?:chatgpt\.com|openai|copilot\.com|perplexity)",
         "delete the tool residue and cite the real source", "CRITICAL"),
        ("unfilled placeholder", r"(?<![\[\w])\[(?:insert|add|enter|your|replace)\s[^\]\n]{0,40}\](?![\](])",
         "fill it in or cut the sentence", "CRITICAL"),

        # -- openers, transitions, labels
        ("banned opener", SS + r"In (?:today's|an era|the ever-evolving|the realm|the world) [^.]{0,60}",
         "cut the opener, start with the content", "CRITICAL"),
        ("banned opener", SS + r"(?:In the age of|As we navigate|In a world where)\b",
         "cut the opener, start with the content", "CRITICAL"),
        ("hedging", r"\b(?:it(?:'s| is) worth (?:noting|mentioning|pointing out|highlighting|emphasizing|stressing)|"
                    r"it(?:'s| is) important to (?:note|remember|recognize|keep in mind)|"
                    r"needless to say|at the end of the day)\b|"
                    + SS + r"(?:That (?:being )?said|With that said|Having said that),",
         "delete the hedge, keep the fact", "HIGH"),
        ("robotic transition", SS + r"(?:Furthermore|Moreover|Additionally|In conclusion|"
                               r"To sum up|In summary|Ultimately)\b",
         "cut the transition or use a plain one", "HIGH"),
        ("metadiscourse label", r"\b(?:the key takeaway is|key takeaways?:|what this means is|"
                                r"the bottom line is|simply put|put simply)\b",
         "delete the label, keep the claim", "HIGH"),
        ("restatement label", r"\bin other words\b",
         "JUDGMENT: common in human prose too; keep it only if the restatement adds something", "LOW"),
        ("sycophantic opener", SS + r"(?:Absolutely|Certainly|Great question|Excellent question|"
                               r"You(?:'re| are) absolutely right|That(?:'s| is) a great point)\b",
         "delete the affirmation, answer directly", "HIGH"),
        ("faux intimacy", r"\b(?:here(?:'s| is) the (?:thing|kicker|catch)|let(?:'s| us) (?:unpack|break this down)|"
                          r"here(?:'s| is) an uncomfortable truth)\b",
         "cut it, let the next sentence stand alone", "HIGH"),
        ("announced content", r"\blet(?:'s| us) (?:dive|dig|jump) (?:in|into|right in|deeper)\b|"
                              r"\bhere(?:'s| is) (?:what|everything) you need to know\b|\bwithout further ado\b|\bbuckle up\b",
         "cut the announcement; start with the first real point", "HIGH"),
        ("announced content", r"\bin this (?:guide|article|post|tutorial|piece|blog post|write-up|deep dive),? "
                              r"(?:we(?:'ll| will)|I(?:'ll| will)) (?:walk|explore|dive|cover|look|take|go|discuss|examine|break|unpack)\b|"
                              r"\bthis (?:comprehensive |complete |ultimate |definitive |in-depth )(?:guide|article|post|tutorial)\b",
         "cut the announcement; start with the first real point", "MEDIUM"),

        # -- narrator tells (Category 8)
        ("meta-narration",
         r"\b(?:this|the) (?:page|site|post|article|section|guide|essay|piece|chapter|note|write-up|email|message) "
         r"(?:is|stays|runs|was kept) (?:short|brief|long|shorter|longer)\b|"
         r"\bwhat this (?:page|site|post|article|section|guide|essay|piece|chapter|document) "
         r"(?:is not|isn't|doesn't|does not|won't|will not|leaves out|skips)\b|"
         r"\b(?:this|the) (?:page|site|post|article|section|guide|essay|piece|chapter|document) "
         r"(?:has to|needs to|must|wants to) (?:say|admit|be (?:honest|clear|upfront|plain))\b|"
         r"\b(?:it(?:'s| is)|that(?:'s| is)|this is|which is) worth a (?:moment|minute|second|pause|beat|detour)\b|"
         r"\bworth (?:dwelling|pausing|lingering) on\b|"
         r"\btakes? (?:a (?:minute|moment|second|sentence)|one sentence|a single sentence|two sentences|"
         r"a few (?:sentences|words|lines)) to (?:see|explain|say|describe|unpack|appreciate|state|spell out)\b|"
         r"\btakes? (?:one|a single) sentence\b|"
         r"\b(?:two|three|a few|several|some) (?:things|points|details|notes) (?:are|is) worth "
         r"(?:saying|mentioning|noting|flagging|stating|adding|knowing)\b",
         "start with the subject; cut the sentence about the page", "HIGH"),
        ("performed candor",
         SS + r"(?:So,? )?(?:Plainly|Bluntly|Candidly|Frankly|Put plainly|To put it (?:plainly|bluntly)|"
         r"To be (?:honest|frank|blunt|candid)|Truth be told|Full disclosure|Real talk|Honestly|"
         r"Let(?:'s| us) be (?:honest|real|frank)|I(?:'ll| will) be (?:honest|straight|upfront|blunt))\b[,:?]",
         "state the fact without announcing that it is honest", "HIGH"),
        ("performed candor",
         r"\b(?:one|an|a small|a quick|a final) (?:admission|confession)\b|"
         r"\bthe honest (?:version|answer|truth|take|reality|assessment|picture)\b|"
         r"\b(?:better|best) (?:stated|said|admitted|flagged|named|acknowledged) (?:here|now|up ?front|early|plainly)\b|"
         r"\b(?:won't|will not|isn't going to|is not going to|not going to|no point|no use) (?:pretend|pretending)\b|"
         r"\bsay so plainly\b",
         "state the fact without announcing that it is honest", "HIGH"),
        ("self-described tone", r"\bno[- ](?:fluff|nonsense|frills|hype|BS)\b",
         "cut the description; let the wording show it", "MEDIUM"),
        ("staged setup", SS + r"(?:The )?(?:good|bad|great) news(?: is)?[:,]|" + SS + r"(?:Spoiler|Plot twist)(?: alert)?:",
         "lead with the fact", "MEDIUM"),
        ("slogan pair", SS + r"(?:Less|More|Fewer) [\w' -]{2,25}, (?:more|less|fewer|faster|slower|better|easier)\b[^.!?]{0,30}[.!]",
         "fold the claim into a sentence with its reason", "MEDIUM"),
        ("clipped negation", SS + r"No [\w'-]+(?: [\w'-]+)?, no [\w'-]+(?: [\w'-]+)?[.!]",
         "say what the reader does instead", "MEDIUM"),

        # -- contrast framing
        # The pronoun opens the sentence, so a relative clause ("commits that are
        # not in X are saved. This is...") does not match.
        ("negative parallelism",
         SS + r"(?:(?:and|but|so),? )?(?:it|this|that|they|these)"
         r"(?:(?:'s|’s| is| was|'re|’re| are| were) not| isn't| wasn't| aren't| weren't| isn’t| wasn’t| aren’t| weren’t) "
         r"(?:just |merely |only |simply )?(?:about )?[^.,;:!?]{2,60}[,;.:] "
         r"(?:(?:it|this|that|they)(?:'s|’s| is| was|'re|’re| are)(?! (?:why|how|when|where|because)\b)|"
         r"but (?:a|an|the|about|rather|instead|also)|rather|instead)\b",
         "state the real claim once, directly", "HIGH"),
        ("negative parallelism", SS + r"Not (?:a|an|the|just|because|only|for|about)\b[^.!?]{2,40}[,.;] (?:[Nn]ot|[Nn]or)\b",
         "state the conclusion, cut the setup", "HIGH"),
        ("negative parallelism", r"\bnot (?:just|merely|simply) [^.,;:!?]{2,50}[,;] but (?:also )?\b",
         "state the real claim once, directly", "HIGH"),
        ("definition by contrast", r"\brather than (?:merely|simply|just|relying (?:on|solely)|focusing (?:on|solely))\b|"
                                   r"\bnot (?:simply|merely)\b|\bless like (?:a |an |the )?[\w'-]+(?: [\w'-]+){0,3},? and more like\b",
         "say what it is; drop the foil", "HIGH"),
        ("significance explainer", r"\bmatters (?:because|more than)\b|\b(?:the|this|that) distinction matters\b",
         "cut the explainer; show the consequence where the fact is stated", "HIGH"),

        # -- significance, puffery, reveals
        ("inflated significance",
         r"\bset(?:s|ting)? the stage for\b|\bpav(?:e|es|ed|ing) the way (?:for|to)\b|"
         r"\b(?:left|leaves|leaving|leave) an? (?:indelible|lasting|enduring) (?:mark|impression|legacy)\b|"
         r"\bmark(?:s|ed|ing)? a (?:pivotal|significant|major|turning) (?:moment|point|shift|milestone)\b|"
         r"\bplay(?:s|ed|ing)? an? (?:vital|crucial|pivotal|significant|instrumental) role\b|"
         r"\benduring legacy\b|\brich (?:history|heritage|tradition|tapestry)\b|\bdeeply rooted\b|"
         r"\bstands? as an? (?:testament|reminder|symbol|beacon)\b|\ba testament to\b",
         "say what actually happened, or cut it", "HIGH"),
        # The participle takes an object; ", showcasing, pivotal" is a word list.
        ("participial significance tail",
         r",\s+(?:(?:highlighting|underscoring|emphasizing|emphasising|showcasing|symbolizing|symbolising|cementing|"
         r"solidifying|reaffirming|signaling|signalling)(?=\s+[\w\"'])|setting the stage|paving the way)\b[^.!?;]{0,80}",
         "cut the -ing tail or replace it with the concrete consequence", "HIGH"),
        ("participial significance tail",
         r",\s+(?:reflecting|demonstrating|illustrating|reinforcing|contributing to|marking)\s+"
         r"(?:the|a|an|its|their|his|her|this|how|broader|growing|ongoing|increasing)\b[^.!?;]{0,80}",
         "JUDGMENT: keep it only if the clause adds a concrete fact", "MEDIUM"),
        ("deeper-truth reveal", r"\bwhat (?:really|actually|truly) matters\b|\bthe heart of the matter\b|"
                                r"\bhere(?:'s| is) what (?:really|actually) matters\b|" + SS + r"The truth is,?|"
                                r"\bthe deeper (?:reason|truth|question|point|issue|lesson|story|meaning)\b",
         "cut the reveal; state the point", "HIGH"),
        ("deeper-truth reveal", r"\bthe (?:real|true|actual|bigger) (?:question|issue|problem|point|story|reason|lesson|truth|answer) (?:is|was|here)\b",
         "JUDGMENT: cut the reveal; state the point", "MEDIUM"),
        ("emphasis crutch", r"\blet that sink in\b|\bread that again\b|\bcannot be overstated\b|"
                            r"\bcan(?:not|'t) stress (?:this|that|it) enough\b|\bit bears repeating\b|"
                            r"\bmake no mistake\b|\bmark my words\b",
         "cut it; if the point needs a push, add evidence", "HIGH"),
        ("data false agency", r"\bthe (?:numbers|data|results|evidence|facts|stats|metrics) (?:speak for themselves|don't lie|"
                              r"tell (?:a|the) (?:clear |whole |real )?story)\b",
         "state what the numbers show", "HIGH"),
        ("notability puffery", r"\bmaintains? an active (?:social media |online )?presence\b|"
                               r"\b(?:has been |was )?(?:featured|profiled) (?:in|by) (?:outlets|publications|media) (?:such as|like|including)\b|"
                               r"\b(?:widely|highly|critically) (?:acclaimed|celebrated|praised)\b",
         "cite the specific coverage or cut it", "MEDIUM"),
        ("knowledge-limit disclaimer", r"\b(?:based on|according to) (?:the )?(?:available|limited) (?:information|data|sources)\b|"
                                       r"\b(?:specific |exact )?details (?:are|remain) (?:limited|scarce|not (?:widely )?available)\b|"
                                       r"\bI (?:don't|do not) have (?:access to )?(?:real-time|current|up-to-date) (?:information|data)\b",
         "find the fact or cut the sentence", "HIGH"),
        ("generic upbeat ending", r"\bthe future (?:looks|is looking) (?:bright|promising)\b|\bexciting times (?:lie )?ahead\b|"
                                  r"\ba step in the right direction\b|\bthe possibilities are (?:endless|limitless|infinite)\b|"
                                  r"\bonly time will tell\b|\bthe sky(?:'s| is) the limit\b|\bthe best is yet to come\b|"
                                  r"\bthe journey (?:is just beginning|continues)\b",
         "end on the last real fact", "HIGH"),

        # -- attribution and hedging
        ("weasel attribution", r"\b(?:experts? (?:agree|say)|studies show|research shows|"
                               r"industry reports?|it(?:'s| is) widely (?:known|believed)|"
                               r"many (?:believe|argue)|some would say|observers (?:have )?noted|critics (?:have )?argued)\b",
         "name the source or cut the claim", "HIGH"),
        ("vague attribution", r"\b(?:is|are|was|were|has been|have been) (?:widely|often|frequently|generally|commonly) "
                              r"(?:regarded|considered|seen|viewed|described|recognized|hailed|cited) as\b",
         "JUDGMENT: say who holds the view, or state the fact", "MEDIUM"),
        ("stacked hedge", r"\b(?:could|may|might|can) (?:potentially|possibly|conceivably)\b|\bpotentially (?:could|might|may)\b",
         "commit to one hedge or none", "MEDIUM"),
        ("strawman disclaimer", SS + r"(?:To be clear|Don't get me wrong|I'm not saying|That's not to say|"
                                r"This isn't to say|That isn't to say)\b",
         "cut the disclaimer; nobody raised the objection", "MEDIUM"),
        ("strawman alternative", r"\b(?:a|one) tempting (?:approach|option|solution|answer|shortcut) (?:would be|is)\b|"
                                 r"\b(?:one|you) might be tempted to\b",
         "state the approach you chose and why", "MEDIUM"),

        # -- word-level collocations (Graphite 2026 ratios against pre-ChatGPT human text)
        ("intensifier", r"\bthe single (?:most|biggest|greatest|best)\b|\barguably the (?:most|best|biggest|greatest)\b",
         "cut the superlative; give the measurement or the comparison", "HIGH"),
        ("intensifier", r"\babsolutely (?:essential|critical|crucial|vital|necessary|fundamental)\b|\bevery single\b",
         "cut the intensifier; let the fact carry the weight", "MEDIUM"),
        ("stock metaphor", r"\bis the (?:language|currency|backbone|lifeblood|heartbeat|beating heart|DNA|north star|"
                           r"secret sauce|glue|engine) of\b",
         "say what it does", "MEDIUM"),
        ("summary caboose", SS + r"(?:Together|Taken together|All together),? these\b|" + SS + r"(?:All in all|Overall),",
         "end on the detail, not the recap", "MEDIUM"),
        ("future gazing", SS + r"Looking ahead,|\bwhat comes next\b|\bthe road ahead\b|\bin the years to come\b",
         "end on the present fact", "MEDIUM"),
        ("wordy filler", r"\bdue to the fact that\b|\bat this point in time\b|\bhas the ability to\b|\bhave the ability to\b|"
                         r"\bfor all intents and purposes\b|\bfirst and foremost\b|\beach and every\b|"
                         r"\bin order to (?=(?:ensure|achieve|facilitate|enhance|optimize|maximize|foster|leverage)\b)",
         "use the short form: because, now, can", "MEDIUM"),
        ("trade-off reassurance", r"\bwithout (?:sacrificing|compromising|losing|requiring)\b",
         "JUDGMENT: name the cost that was avoided, or cut the clause", "LOW"),
        ("stock furniture", r"\b(?:built|made|crafted) with (?:♥|❤️?|love|care|passion)\b|"
                            r"\btrusted by (?:\d[\d,.]*\+?k?|thousands|millions|hundreds|leading)\b|"
                            r"\bjoin (?:\d[\d,.]*\+?k?|thousands|millions|hundreds) (?:of )?(?:other )?"
                            r"(?:users|teams|creators|developers|people|customers|businesses|companies)\b|"
                            r"\bno (?:credit card|signup|sign-up|download|installation|install|account) (?:required|needed)\b",
         "JUDGMENT: keep only a specific, true claim the page needs", "LOW"),

        # -- email
        ("email cliche", r"\bhope (?:this|the|my) (?:email|message|note) finds you well\b",
         "start with the reason for writing", "HIGH"),
        ("email cliche", r"\b(?:I|just) wanted to reach out\b|\bI(?:'m| am) reaching out (?:to|because|regarding|about)\b|"
                         r"\bjust circling back\b",
         "start with the reason for writing", "MEDIUM"),

        # -- existing structural phrases
        ("dressed-up copula", r"\b(?:serves? as|stands? as|acts? as|functions? as|boast(?:s|ing)?)\b",
         "use is or has", "MEDIUM"),
        ("boilerplate ending", r"\bWhether you(?:'re| are)\b",
         "pick the actual audience and address them", "CRITICAL"),
        ("boilerplate ending", r"\b(?:let me know if|happy to help|I hope this helps|don(?:'t| not) hesitate to|"
                               r"feel free to (?:reach out|ask|contact|get in touch|let (?:me|us) know|drop|ping|"
                               r"share|leave|comment))\b",
         "end on the content, drop the service closer", "HIGH"),
        ("wh-cleft opener", SS + r"What (?:makes|made|sets|set) (?:this|that|it|them|these)"
                            r"[^.!?]{0,40}\b(?:is|was|are|were)\b",
         "delete the scaffold, start with the actual point", "MEDIUM"),
        ("acknowledge-then-dismiss", r"\bDespite (?:its|these|the) (?:challenges|drawbacks|limitations)\b",
         "detail the challenge and its real resolution, or cut the beat", "MEDIUM"),
        ("counting before a list", r"\bthere are (?:two|three|four|five|\d+) (?:reasons|things|factors|key)\b|"
                                   r"\bthis means (?:a few|several|two|three) things\b|"
                                   r"\b(?:a few|several|a couple of) (?:things|points) stand out\b",
         "just list them, drop the count", "MEDIUM"),
        # An arrow between words stands in for a verb; one that opens or closes a
        # link ("← Back", "Next →") is interface chrome.
        ("unicode decoration", r"(?<=\S )[→←⇒](?= \S)|•(?=\s)",
         "write the word out", "MEDIUM"),
        ("smart quote", r"[‘’“”]",
         "use straight quotes", "LOW"),
        ("unearned stakes", r"\b(?:fundamentally reshape|change everything|"
                            r"a new era of|the future of \w+ is)\b",
         "scale the claim to the evidence", "MEDIUM"),
        ("false range", r"\bfrom (?:(?!CODE\b|URL\b)[A-Za-z' ]){2,25} to (?:(?!CODE\b|URL\b)[A-Za-z' ]){2,25} to "
                        r"(?:(?!CODE\b|URL\b)[A-Za-z' ]){2,25}\b",
         "list the actual items, do not fake a continuum", "LOW"),
    ]
    for name, pat, fix, sev in phrase_rules:
        v.append((name, re.compile(pat, R), fix, sev))
    return v


RULES = rules()

# Only the stock setup phrases. A bare "Label: value" line is note syntax, not a reveal.
COLON_REVEAL = re.compile(
    SS + r"((?:here(?:'s| is) (?:the|why|what)|"
    r"(?:and |but )?the (?:best part|worst part|result|kicker|catch|twist|upshot|"
    r"real (?:problem|question|reason)|bottom line)|"
    r"one (?:more )?thing)\s*:\s+)([^.!?\n]{3,70}[.!?])", R)

SIGNPOST = re.compile(
    r"^(?:\*\*)?(?:For|Since|If|While|When|Although|Because|Given|With|After|Once|As|Beyond|Between)"
    r"\b[^,.]{0,60},\s", R)

PERFECT_THREE = re.compile(
    r"\b([\w-]+),\s+([\w-]+),\s+and\s+([\w-]+)(?=\s*[.,;:)!?]|\s*$)")

# "a scaffold, not a law": a short appositive flip closing its clause.
FLIP = re.compile(
    r"[\w'’-]+,\s+not\s+(?!(?:only|yet|always|even|quite|necessarily|least|to mention|all|every|surprisingly|"
    r"exactly|much|many|really|so|too|very|entirely|unlike|counting|including|just)\b)"
    r"(?:(?:a|an|the|in|on|at|to|for|by|with|from|as|of|into)\s+)?[\w'’-]+(?:\s+[\w'’-]+){0,2}"
    r"(?=\s*(?:[.,;:!?)]|$))", R)

# Words measured far above human rates in model output (Graphite 2026, Kobak et al. 2025).
# One is normal; a cluster is the tell.
FAVORED = re.compile(
    r"\b(dependabl[ey]|practical(?:ly)?|deliberate(?:ly)?|steady|steadily|profound(?:ly)?|immense(?:ly)?|"
    r"incredibl[ey]|remarkabl[ey]|enormously|intricate(?:ly)?|notabl[ey]|genuine(?:ly)?|invaluable|noteworthy|"
    r"unveil(?:s|ed|ing)?|load-bearing|nuanced|compelling|elegant(?:ly)?|truly|crucially)\b", R)

WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’-]*")
FENCE = re.compile(r"^\s*(```|~~~)")
BOUNDARY = re.compile(r"[.!?][\"'”’)\]]*(?=\s+\S)")
ABBREV = re.compile(r"(?:\b(?:e\.g|i\.e|etc|vs|cf|approx|incl|Mr|Mrs|Ms|Dr|St|Jr|Sr|No|Fig|Vol|pp?)|(?<![A-Za-z])[A-Z])\.$")


def sentences(text):
    """Split prose into (offset, sentence) without breaking at common abbreviations."""
    out, start = [], 0
    for m in BOUNDARY.finditer(text):
        cand = text[start:m.end()]
        rest = text[m.end():].lstrip()
        if ABBREV.search(cand) or rest[:1].islower():
            continue
        if cand.strip():
            out.append((start + len(cand) - len(cand.lstrip()), cand.strip()))
        start = m.end()
    tail = text[start:]
    if tail.strip():
        out.append((start + len(tail) - len(tail.lstrip()), tail.strip()))
    return out


def nwords(text):
    return len(WORD.findall(text))


def snippet(text, start, end, width=90):
    lo = max(0, start - 20)
    hi = min(len(text), end + 30)
    s = " ".join(text[lo:hi].split())
    if len(s) > width:
        s = s[:width].rstrip() + "..."
    return s


def finding(path, line, pattern, severity, text, fix):
    return dict(file=path, line=line, pattern=pattern, severity=severity, text=text, fix=fix)


# ---------------------------------------------------------------- documents
# A document is a list of blocks. Each block is one paragraph, heading, list
# item, table cell, or string literal, joined into one line of text, with a map
# from character offsets back to source lines.


class Block:
    __slots__ = ("kind", "text", "starts", "lines")

    def __init__(self, kind, lineno):
        self.kind, self.text, self.starts, self.lines = kind, "", [0], [lineno]

    def add(self, text, lineno):
        text = " ".join(text.split())
        if not text:
            return
        if self.text:
            if text[0] not in ".,;:!?)":
                self.text += " "
            self.starts.append(len(self.text))
            self.lines.append(lineno)
        else:
            self.lines[0] = lineno
        self.text += text

    def line_at(self, pos):
        return self.lines[max(bisect.bisect_right(self.starts, pos) - 1, 0)]


class Doc:
    def __init__(self, path, fmt, blocks, lines=None, code=()):
        self.path, self.fmt, self.blocks, self.lines, self.code = path, fmt, blocks, lines, code
        self.words = sum(nwords(b.text) for b in blocks)


MARKUP_EXT = {".svelte", ".html", ".htm", ".vue", ".astro", ".jsx", ".tsx"}
CODE_EXT = {".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".py"}

MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+")
MD_LIST = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
MD_TABLE = re.compile(r"^\s*\|")
MD_TABLE_RULE = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")


def code_lines(lines):
    """Line numbers of front matter, fence lines, and fenced code."""
    out = set()
    in_fence = False
    in_front = bool(lines) and lines[0].strip() == "---"
    for i, raw in enumerate(lines, 1):
        if in_front:
            out.add(i)
            if i > 1 and raw.strip() in ("---", "..."):
                in_front = False
            continue
        if FENCE.match(raw):
            in_fence = not in_fence
            out.add(i)
        elif in_fence:
            out.add(i)
    return out


def strip_code(lines, code=None):
    """Return list of (lineno, text) with fenced code blocks and front matter blanked out."""
    code = code_lines(lines) if code is None else code
    return [(i, "" if i in code else raw) for i, raw in enumerate(lines, 1)]


def md_clean(text):
    text = re.sub(r"`[^`\n]+`", "CODE", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]\n]+)\]\([^)\s]+(?:\s+\"[^\"]*\")?\)", r"\1", text)
    text = re.sub(r"<https?://[^>\s]+>|https?://\S+", "URL", text)
    text = re.sub(r"</?[A-Za-z][^>\n]*>", " ", text)
    return text


def md_blocks(body):
    blocks, cur = [], None

    def close():
        nonlocal cur
        if cur is not None and cur.text:
            blocks.append(cur)
        cur = None

    for lineno, raw in body:
        if not raw.strip():
            close()
            continue
        if MD_HEADING.match(raw):
            close()
            b = Block("h", lineno)
            b.add(md_clean(MD_HEADING.sub("", raw)).strip().rstrip("#"), lineno)
            if b.text:
                blocks.append(b)
            continue
        if MD_TABLE.match(raw):
            close()
            if not MD_TABLE_RULE.match(raw):
                for cell in raw.strip().strip("|").split("|"):
                    b = Block("td", lineno)
                    b.add(md_clean(cell), lineno)
                    if b.text:
                        blocks.append(b)
            continue
        text = md_clean(re.sub(r"^\s*>\s?", "", raw))
        if MD_LIST.match(raw):
            close()
            cur = Block("li", lineno)
            cur.add(MD_LIST.sub("", text), lineno)
            continue
        if cur is None:
            cur = Block("p", lineno)
        cur.add(text, lineno)
    close()
    return blocks


# Markup: keep the characters a visitor reads, blank the rest, keep newlines.
BLOCK_TAGS = set("p h1 h2 h3 h4 h5 h6 li ul ol dl dt dd div section header footer article aside main nav "
                 "table thead tbody tr td th caption blockquote figure figcaption br hr button label summary "
                 "details form fieldset legend option select textarea input img svg title pre iframe video "
                 "audio canvas picture source".split())
BREAK, HEAD, ITEM, CELL, TITLE = "\x00", "\x01", "\x02", "\x03", "\x04"
STRING_LIT = re.compile(r"\"((?:[^\"\\\n]|\\.){12,})\"|'((?:[^'\\\n]|\\.){12,})'|`((?:[^`\\]|\\.){12,})`", re.S)
FUNCTION_WORDS = set("the a an of to and or in on at for by with from is are was were be it its this that "
                     "you your we our can will not".split())


def prose_string(s):
    s = re.sub(r"\$\{[^}]*\}", "___", s)
    if re.search(r"[{}<>=\\]|https?:|^\s*[./$@#]|\w\.\w+\(|::", s):
        return None
    words = s.split()
    if len(words) < 5 or not re.search(r"[a-z]", s):
        return None
    plain = sum(1 for w in words if re.fullmatch(r"[\"'(]?[A-Za-z][A-Za-z'’]*[.,;:!?)\"']*|[\"'(]?\d[\d,.]*[%.,;:)]*|___", w))
    if plain < 0.7 * len(words) or not any(w.lower().strip(".,;:!?") in FUNCTION_WORDS for w in words):
        return None
    return s


# A string assigned to one of these names is page metadata: "title" names the
# page's subject, the rest (descriptions, labels) are templated by design.
META_NAME = re.compile(r"(title|heading|headline)|desc|summary|meta|seo|label|caption|tagline|keywords|alt$", R)


def string_blocks(code, base, content):
    """Prose-like string literals in a script, as blocks at their source lines."""
    out = []
    for m in STRING_LIT.finditer(code):
        s = prose_string(m.group(1) or m.group(2) or m.group(3) or "")
        if s:
            lineno = content.count("\n", 0, base + m.start()) + 1
            name = re.search(r"([A-Za-z_$][\w$]*)[\"']?\s*[:=]\s*$", code[max(0, m.start() - 80):m.start()])
            meta = META_NAME.search(name.group(1)) if name else None
            b = Block(("title" if meta.group(1) else "meta") if meta else "str", lineno)
            b.add(unescape(s), lineno)
            out.append(b)
    return out


def _blank(vis, i, j, mark=None):
    for k in range(i, min(j, len(vis))):
        if vis[k] != "\n":
            vis[k] = " "
    if mark and i < len(vis) and vis[i] != "\n":
        vis[i] = mark


def _match_brace(s, i):
    """Index just past the brace that closes s[i] == '{', skipping quoted strings."""
    depth, k, quote = 0, i, None
    while k < len(s):
        c = s[k]
        if quote:
            if c == "\\":
                k += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return k + 1
        k += 1
    return len(s)


def _tag_end(s, i):
    """Index just past the '>' that closes the tag opening at s[i] == '<'."""
    k, quote = i + 1, None
    while k < len(s):
        c = s[k]
        if quote:
            if c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif c == "{":
            k = _match_brace(s, k)
            continue
        elif c == ">":
            return k + 1
        k += 1
    return len(s)


def markup_doc_blocks(content):
    vis = list(content)
    extra = []
    for m in re.finditer(r"<!--.*?-->", content, re.S):
        _blank(vis, m.start(), m.end())
    if content.startswith("---"):
        m = re.match(r"---\n(.*?)\n---", content, re.S)
        if m:
            extra += string_blocks(m.group(1), 4, content)
            _blank(vis, 0, m.end())
    for m in re.finditer(r"<(script|style)\b[^>]*>(.*?)</\1\s*>", content, re.S | R):
        if m.group(1).lower() == "script" and "ld+json" not in m.group(0)[:80]:
            extra += string_blocks(m.group(2), m.start(2), content)
        _blank(vis, m.start(), m.end(), BREAK)
    for m in re.finditer(r"<(pre|code)\b[^>]*>.*?</\1\s*>", content, re.S | R):
        _blank(vis, m.start(), m.end(), BREAK if m.group(1).lower() == "pre" else None)

    text = "".join(vis)
    i = svg = 0
    while i < len(text):
        c = text[i]
        if c == "{":
            j = _match_brace(text, i)
            inner = text[i + 1:j - 1].strip()
            if inner[:1] in "#:/@":
                _blank(vis, i, j, BREAK)
            else:
                _blank(vis, i, j)
                k = i
                for ch in "___":
                    if k < j and vis[k] != "\n":
                        vis[k] = ch
                    k += 1
            i = j
            continue
        if c == "<" and i + 1 < len(text) and (text[i + 1].isalpha() or text[i + 1] in "/!"):
            j = _tag_end(text, i)
            name = re.match(r"</?\s*([A-Za-z][\w:.-]*)", text[i:j])
            tag = name.group(1) if name else ""
            closing = text[i + 1:i + 2] == "/"
            mark = None
            if tag.lower() == "svg" and text[j - 2] != "/":
                svg += -1 if closing else 1
            if tag.lower() in BLOCK_TAGS or tag[:1].isupper() or ":" in tag:
                mark = BREAK
                if not closing and re.fullmatch(r"h[1-6]", tag.lower()):
                    mark = HEAD
                elif not closing and tag.lower() == "li":
                    mark = ITEM
                elif not closing and tag.lower() in ("td", "th"):
                    mark = CELL
                elif not closing and tag.lower() == "title" and svg <= 0:
                    mark = TITLE  # the page title, not an SVG label
            _blank(vis, i, j, mark)
            i = j
            continue
        i += 1

    blocks, cur = [], None
    kinds = {BREAK: "p", HEAD: "h", ITEM: "li", CELL: "td", TITLE: "title"}
    pending = "p"
    for lineno, line in enumerate("".join(vis).split("\n"), 1):
        for part in re.split("([\x00-\x04])", line):
            if part in kinds:
                if cur is not None and cur.text:
                    blocks.append(cur)
                cur = None
                pending = kinds[part]
                continue
            text = unescape(part).replace("\xa0", " ")
            if not text.strip():
                continue
            if cur is None:
                cur = Block(pending, lineno)
            cur.add(text, lineno)
    if cur is not None and cur.text:
        blocks.append(cur)
    blocks += extra
    blocks.sort(key=lambda b: b.lines[0])
    return blocks


def load(path, content, fmt="auto"):
    ext = os.path.splitext(path)[1].lower()
    if fmt == "auto":
        fmt = "markup" if ext in MARKUP_EXT else "code" if ext in CODE_EXT else "markdown"
    if fmt == "markup":
        return Doc(path, fmt, markup_doc_blocks(content))
    if fmt == "code":
        return Doc(path, fmt, string_blocks(content, 0, content))
    lines = content.splitlines()
    code = code_lines(lines)
    body = strip_code(lines, code)
    return Doc(path, fmt, md_blocks(body), body, code)


# ---------------------------------------------------------------- checks


def scan_phrases(doc):
    found = []
    for b in doc.blocks:
        text = b.text
        for name, rx, fix, sev in RULES:
            for m in rx.finditer(text):
                label = name
                if name == "blacklisted word":
                    label = "blacklisted word: %s" % m.group(1).lower()
                found.append(finding(doc.path, b.line_at(m.start()), label, sev,
                                     snippet(text, m.start(), m.end()), fix))
        for m in COLON_REVEAL.finditer(text):
            found.append(finding(doc.path, b.line_at(m.start()), "colon reveal", "MEDIUM",
                                 snippet(text, m.start(), m.end()),
                                 "drop the setup phrase and the colon, state the claim"))
        for m in PERFECT_THREE.finditer(text):
            if text[:m.start()].rstrip().endswith(","):
                continue  # the tail of a longer list
            found.append(finding(doc.path, b.line_at(m.start()), "perfect three", "MEDIUM",
                                 snippet(text, m.start(), m.end()),
                                 "cut to two items or break the rhythm"))
    return found


def prose_sentences(doc, kinds=("p", "li", "str")):
    """Document-order list of (block, offset, sentence, words)."""
    out = []
    for b in doc.blocks:
        if b.kind in kinds:
            for off, s in sentences(b.text):
                out.append((b, off, s, nwords(s)))
    return out


# A verb or a subject pronoun makes the answer a sentence ("There are several
# ways.", "Don't panic."), not a staged fragment ("Some of it.", "Partially.").
FINITE = re.compile(r"\b(?:is|are|was|were|am|be|been|has|have|had|do|does|did|can|could|will|would|shall|"
                    r"should|may|might|must)\b|n['’]t\b|['’](?:s|re|ll|ve|d|m)\b|"
                    r"^(?:i|you|we|they|he|she|it|there)\b", R)
# An imperative addressed to the reader is a sentence too ("Submit it here.").
IMPERATIVE = re.compile(r"(?:please |just )?(?:submit|send|tell|e-?mail|message|text|call|contact|reach|ask|"
                        r"let (?:us|me) know|join|share|reply|report|file|leave|drop|ping|write|try|use|click|"
                        r"tap|press|type|run|open|see|check|read|visit|go|head|get|sign|download|install|add|"
                        r"follow|subscribe|register|watch|listen|look|find|search|browse|select|choose|pick|"
                        r"scroll|jump)\b", R)


def scan_question_fragment(doc):
    """A question answered by a verbless fragment, in the same block or the next one."""
    found = []
    seq = []
    for b in doc.blocks:
        if b.kind in ("p", "h", "li", "str", "meta"):
            for off, s in sentences(b.text):
                seq.append((b, off, s))
    for (b1, o1, q), (b2, o2, a) in zip(seq, seq[1:]):
        if b1 is not b2 and (b2.kind != "p" or b1.kind not in ("p", "h")):
            continue
        n = nwords(a)
        if q.rstrip("\"'”’").endswith("?") and 0 < n <= 4 and a.rstrip("\"'”’").endswith(".") \
                and not FINITE.search(a) and not IMPERATIVE.match(a) \
                and not re.match(r"(?:yes|no|sure|nope|yep)\b", a, R):
            found.append(finding(doc.path, b2.line_at(o2), "question then fragment", "MEDIUM",
                                 " ".join((q + " " + a).split())[-90:],
                                 "state the answer as a sentence, delete the question"))
    return found


def _density_gate(items, words, per_1000):
    return len(items) >= 2 and 1000.0 * len(items) / max(words, 1) >= per_1000


def contrast_flips(doc):
    items = []
    for b in doc.blocks:
        if b.kind in ("p", "li", "str", "td", "meta"):
            for m in FLIP.finditer(b.text):
                items.append((b.line_at(m.start()), snippet(b.text, m.start(), m.end())))
    return items


# Short sentences that carry a reference, a literal, or an instruction are
# information, not rhythm.
PUNCH_SKIP = re.compile(r"(?:[^A-Za-z]|(?:see|also see|see also|e\.g|i\.e|for (?:example|instance|more|details|"
                        r"information)|note|here (?:is|are)|try it|now (?:press|type|run)|and so on)\b)", R)
LITERAL = re.compile(r"\bCODE\b|\bURL\b|\d|[\"“”()\[\]:*_`=/<>+#]|(?<![A-Za-z])'|'(?![A-Za-z])")


def rhetorical(s):
    """A plain-word sentence ending in a period: the shape a punchline takes."""
    return s.endswith(".") and not s.endswith("..") and not PUNCH_SKIP.match(s) and not LITERAL.search(s)


def punchlines(doc):
    """Short fragments used for rhythm: a closer after long sentences, a one-line
    paragraph after a long one, a mid-paragraph fragment after a long sentence."""
    items = []
    prev_words = 0
    for b in doc.blocks:
        if b.kind not in ("p", "str"):
            if b.kind != "td":
                prev_words = 0
            continue
        sents = sentences(b.text)
        lens = [nwords(s) for _, s in sents]
        plain = [rhetorical(s) for _, s in sents]
        total = sum(lens)
        hits = set()
        if sents and total <= 12 and max(lens) <= 7 and all(plain) and prev_words >= 40:
            hits.add(0)
        for i in range(1, len(sents)):
            if lens[i] <= 5 and plain[i]:
                others = lens[:i] + lens[i + 1:]
                if i == len(sents) - 1 and len(sents) >= 3 and statistics.fmean(others) >= 12:
                    hits.add(i)
                elif lens[i - 1] >= 15 and lens[i] <= 4:
                    hits.add(i)
        for i in sorted(hits):
            off, s = sents[i]
            items.append((b.line_at(off), s if i else " ".join(b.text.split())[:90]))
        prev_words = total
    return items


def parallel_fragments(doc):
    """Two short sentences in a row with the same opener: "Easy to see. Easy to learn." """
    found = []
    for b in doc.blocks:
        if b.kind not in ("p", "li", "str", "meta"):
            continue
        sents = sentences(b.text)
        for (o1, a), (o2, c) in zip(sents, sents[1:]):
            wa, wc = WORD.findall(a), WORD.findall(c)
            if 1 < len(wa) <= 5 and 1 < len(wc) <= 5 and wa[0].lower() == wc[0].lower() \
                    and a[-1:] in ".!" and c[-1:] in ".!":
                found.append(finding(doc.path, b.line_at(o1), "parallel fragments", "HIGH",
                                     " ".join((a + " " + c).split())[:90],
                                     "merge into one sentence that carries the reason"))
    return found


def scan_signposts(doc):
    found, run = [], []
    for b in doc.blocks:
        if b.kind != "p":
            continue
        if SIGNPOST.match(b.text):
            run.append(b)
        else:
            run = []
        if len(run) >= 4:
            for b2 in run:
                found.append(finding(doc.path, b2.lines[0], "signpost paragraph opener", "MEDIUM",
                                     b2.text[:70], "JUDGMENT: cut the connective, start with the content"))
            run = []
    return found


BOLD_BULLET = re.compile(r"^\s*(?:(?:[-*+]|\d+[.)])\s+)?\*\*[^*]{1,40}\*\*\s*[:.]")
HEADING = re.compile(r"^\s*(#{1,6})\s+\S")


def scan_bold_bullets(path, body):
    """A run of 3+ list items that all open with a bold label."""
    found, run = [], []

    def flush():
        if len(run) >= 3:
            found.append(finding(path, run[0], "bold-first bullets", "MEDIUM",
                                 "%d bullets from line %d" % (len(run), run[0]),
                                 "bold only the item that needs emphasis, or drop bold"))

    for lineno, text in body:
        if BOLD_BULLET.match(text):
            run.append(lineno)
        elif text.strip():
            flush()
            run = []
    flush()
    return found


def scan_short_sections(path, body, code=(), min_words=40):
    """A heading over a few words of prose. The document title, and sections that
    hold a code block, table, or list, are exempt."""
    found, cur, words, other = [], None, 0, False

    def flush():
        if cur is not None and words < min_words and not other:
            found.append(finding(path, cur[0], "header on short text", "LOW",
                                 "%s (%d words)" % (cur[1][:60], words),
                                 "JUDGMENT: drop the heading, fold the text into prose"))

    for lineno, text in body:
        m = HEADING.match(text)
        if m:
            flush()
            cur, words, other = ((lineno, text.strip()) if len(m.group(1)) > 1 else None), 0, False
        elif cur is not None:
            if lineno in code or MD_TABLE.match(text) or MD_LIST.match(text):
                other = True
            elif text.strip():
                words += nwords(text)
    flush()
    return found


STOCK_HEADING = re.compile(
    r"^(?:\d+[.)]\s*)?(?:in conclusion|key takeaways?|final thoughts|wrapping up|looking ahead|the road ahead|"
    r"future (?:outlook|directions|prospects)|challenges and (?:opportunities|future directions|outlook|limitations)|"
    r"why (?:this|it) matters)\s*[:.!?]?$", R)


def scan_headings(doc):
    return [finding(doc.path, b.lines[0], "stock section heading", "MEDIUM", b.text[:70],
                    "name the section after its content")
            for b in doc.blocks if b.kind == "h" and STOCK_HEADING.match(b.text.strip())]


def scan_vocabulary(doc):
    hits = []
    for b in doc.blocks:
        for m in FAVORED.finditer(b.text):
            hits.append((b.line_at(m.start()), m.group(1).lower()))
    distinct = {w for _, w in hits}
    if len(hits) >= 3 and len(distinct) >= 2 and 1000.0 * len(hits) / max(doc.words, 1) >= 2.0:
        return [finding(doc.path, hits[0][0], "favored-word cluster", "MEDIUM",
                        "%d hits: %s" % (len(hits), ", ".join(sorted(distinct))[:80]),
                        "JUDGMENT: each word is fine alone; a cluster reads as generated. Swap in plain, specific words")]
    return []


def burstiness(doc):
    lengths = [n for b, _, _, n in prose_sentences(doc, ("p",)) if n >= 3]
    if len(lengths) < 6:
        return []
    sd = statistics.pstdev(lengths)
    mean = statistics.fmean(lengths)
    # Short note-style sentences are naturally uniform. The tell is 12-25 word
    # sentences that never vary.
    if mean >= 12.0 and sd < 5.0:
        return [finding(doc.path, 1, "low burstiness", "MEDIUM",
                        "%d sentences, mean %.1f words, stdev %.1f" % (len(lengths), mean, sd),
                        "JUDGMENT: let length follow the content (human prose usually runs stdev above 6); "
                        "never add fragments to raise it")]
    return []


def scan_doc(doc):
    found = []
    found += scan_phrases(doc)
    found += scan_question_fragment(doc)
    found += parallel_fragments(doc)
    found += scan_signposts(doc)
    found += scan_headings(doc)
    found += scan_vocabulary(doc)
    found += burstiness(doc)
    if doc.lines is not None:
        found += scan_bold_bullets(doc.path, doc.lines)
        found += scan_short_sections(doc.path, doc.lines, doc.code)
    return found


def rhythm_findings(docs):
    """Contrast flips and punchline fragments are normal once. Report them when
    they recur in a page, or across sibling pages passed in the same run."""
    found = []
    per = [(d, contrast_flips(d), punchlines(d)) for d in docs]
    words = sum(d.words for d in docs)
    run_flips = sum(len(f) for _, f, _ in per)
    run_punch = sum(len(p) for _, _, p in per)
    flip_files = sum(1 for _, f, _ in per if f)
    punch_files = sum(1 for _, _, p in per if p)
    # Measured 2026-09-24: human manuals (git, vim; 167k words) peak at 0.6
    # flips and 2.6 punchlines per 1000 words in a page; agent-written docs run
    # 1.0 to 3.0 flips, and the /notation pages 3 to 7 punchlines.
    run_flip_hot = flip_files >= 3 and 1000.0 * run_flips / max(words, 1) >= 0.5
    run_punch_hot = punch_files >= 3 and 1000.0 * run_punch / max(words, 1) >= 1.0
    for d, flips, punch in per:
        if flips and (_density_gate(flips, d.words, 1.0) or run_flip_hot):
            for line, text in flips:
                found.append(finding(d.path, line, "contrast flip", "HIGH", text,
                                     "say what the thing is; name the specific difference once if it matters"))
        if punch and (_density_gate(punch, d.words, 3.0) or run_punch_hot):
            for line, text in punch:
                found.append(finding(d.path, line, "punchline fragment", "HIGH", text,
                                     "fold the point into the sentence before it, or delete it"))
    return found


STOP = set("a an the of to and or in on at for by with from is are was were be been it its this that these "
           "those as but if then so not no do does your you our we they their he she his her".split())


def _stem(word):
    word = word.lower()
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def subject_words(doc):
    """What the page is about: its file name, two parent folders, first heading, and title strings."""
    parts = re.split(r"[\\/]", doc.path)[-3:]
    parts[-1] = os.path.splitext(parts[-1])[0]
    text = " ".join(parts)
    head = next((b for b in doc.blocks if b.kind == "h"), None)
    if head is not None:
        text += " " + head.text
    text += " " + " ".join(b.text for b in doc.blocks if b.kind == "title")
    return {_stem(w) for w in re.findall(r"[A-Za-z]{3,}", text)} - STOP


def template_findings(docs):
    """Sibling pages that share a clause with only the page's own subject swapped:
    "If buugeng are your language" / "If clubs are your language". The swapped
    word must name each page's subject; a manual that reuses "To delete a ___"
    across chapters is consistent, not templated."""
    if len(docs) < 2:
        return []
    counts = [Counter(w.lower() for b in d.blocks for w in WORD.findall(b.text)) for d in docs]
    subjects = [subject_words(d) for d in docs]
    index = defaultdict(list)
    for i, d in enumerate(docs):
        seen = set()
        for b in d.blocks:
            if b.kind not in ("p", "li", "str", "td"):
                continue
            for off, s in sentences(b.text):
                for m in re.finditer(r"[^,;:]+", s):
                    toks = [t.lower() for t in WORD.findall(m.group(0))]
                    if len(toks) < 4 or len(toks) > 16:
                        continue
                    for j, tok in enumerate(toks):
                        if tok in STOP or not tok.isalpha() or _stem(tok) not in subjects[i]:
                            continue
                        if all(t in STOP for t in toks[:j] + toks[j + 1:]):
                            continue
                        key = tuple(toks[:j]) + ("___",) + tuple(toks[j + 1:])
                        if key in seen:
                            continue
                        seen.add(key)
                        index[key].append((i, tok, b.line_at(off + m.start()), m.group(0).strip()))
    found, reported = [], set()
    for key, hits in index.items():
        files = {h[0] for h in hits}
        if len(files) < 2 or len({_stem(h[1]) for h in hits}) < 2:
            continue
        good = [h for h in hits
                if all(counts[h[0]][h[1]] > counts[o][h[1]] for o in files if o != h[0])]
        if len({h[0] for h in good}) < 2 or len({_stem(h[1]) for h in good}) < 2:
            continue
        for i, tok, line, text in good:
            if (i, line) in reported:
                continue
            reported.add((i, line))
            found.append(finding(docs[i].path, line, "slot-swapped template", "CRITICAL",
                                 "%s  [template: %s]" % (text[:50], " ".join(key)[:50]),
                                 "write this passage for its own page, or share one box whose wording "
                                 "does not pretend to be page-specific"))
    return found


def scan_docs(docs):
    found = []
    for d in docs:
        found += scan_doc(d)
    found += rhythm_findings(docs)
    found += template_findings(docs)
    found.sort(key=lambda f: (f["file"], f["line"], f["pattern"], ORDER[f["severity"]]))
    seen, out = set(), []
    for f in found:
        key = (f["file"], f["line"], f["pattern"])
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def scan(path, content, fmt="auto"):
    return scan_docs([load(path, content, fmt)])


def scan_files(contents, fmt="auto"):
    """contents: {path: text}. Scans the files together so cross-page checks run."""
    return scan_docs([load(p, c, fmt) for p, c in contents.items()])


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
    text = unescape(re.sub(r"<[^>]+>", "", html)).replace("\xa0", " ")
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
        found.append(finding(path, n, "hard-wrapped line", "CRITICAL",
                             "...%s / %s..." % (a_s[-35:], b_s[:25]),
                             "put each paragraph on one line (or in one <div>) and let the mail client wrap"))
    return found


def scan_email(path, content, require_contact=None):
    """Email formatting checks plus the normal pass, on the part of the message the sender wrote."""
    text = html_to_text(content) if HTML_HINT.search(content) else content
    body, sig = split_email(text)
    # Keep the source line numbers: pad the scanned text so line N stays line N.
    padded = [""] * (body[-1][0] if body else 0)
    for n, t in body:
        padded[n - 1] = t
    found = scan(path, "\n".join(padded), fmt="markdown")
    found += scan_hard_wraps(path, body)

    for lineno, line in body:
        for m in MARKDOWN.finditer(line):
            found.append(finding(path, lineno, "markdown in email", "HIGH",
                                 snippet(line, m.start(), m.end()),
                                 "strip the markup; the recipient sees the raw asterisks and brackets"))

    written = [(n, t.strip()) for n, t in body if t.strip()]
    if written and not sig and not any(SIGNOFF.match(t) for _, t in written[-4:]):
        found.append(finding(path, written[-1][0], "no sign-off", "HIGH", written[-1][1][:60],
                             "end with a sign-off and the sender's name, or include the signature"))

    if require_contact and written:
        everything = "\n".join(t for _, t in body + sig)
        if not re.search(require_contact, everything):
            found.append(finding(path, written[-1][0], "no contact line", "MEDIUM", written[-1][1][:60],
                                 "add the phone number under the name, or include the signature"))

    found.sort(key=lambda f: (f["line"], f["pattern"]))
    return found


# ---------------------------------------------------------------- self-test
# (label, text, file name, pattern that must appear or None for clean)

SELF_TEST = [
    ("meta-narration", "This page is short because the rules are short. Fans follow clubs.", "a.md", "meta-narration"),
    ("page scope", "First, what this page is not about: toss juggling.", "a.md", "meta-narration"),
    ("candor", "One admission, better stated here than discovered later: the pedagogy is strict.", "a.md",
     "performed candor"),
    ("plainly", "It might be hard. So, plainly: spin however you like.", "a.md", "performed candor"),
    ("wrapped phrase", "The frame splits the same way, and it's worth a\nmoment because it explains the rest.", "a.md",
     "meta-narration"),
    ("flip recurrence", "It is a scaffold, not a law. The two are family, not rivals.", "a.md", "contrast flip"),
    ("single flip is fine", "Use spaces, not tabs, when you indent the file for review.", "a.md", None),
    ("punchline", "Before the software existed, the whole system lived on paper for years and every sequence "
                  "got its own page in a notebook. Two pens.\n\nThe second paragraph runs long enough to count as "
                  "prose, with a few clauses that carry detail about the grid, the arrows, and the colors. "
                  "That was all.", "a.md", "punchline fragment"),
    ("parallel fragments", "A staff is one line. Easy to draw. Easy to remember.", "a.md", "parallel fragments"),
    ("question fragment across blocks", "<p class=\"sub\">Can the alphabet write poi?</p>\n<p>Some of it.</p>",
     "a.svelte", "question then fragment"),
    ("markup hides script and comments", "<script>\n// a comment \u2014 with a dash\nconst x = 1;\n</script>\n"
                                         "<!-- note \u2014 here -->\n<p>Plain words.</p>", "a.svelte", None),
    ("script prose strings", "<script>\nconst note = \"We will delve into the details of the pattern.\";\n</script>",
     "a.svelte", "blacklisted word"),
    ("chatbot residue", "As an AI language model, I cannot verify this.", "a.md", "chatbot artifact"),
    ("citation residue", "The study found it [cite: 3] and more.", "a.md", "chatbot artifact"),
    ("placeholder", "Thanks for the call, [Your Name].", "a.md", "unfilled placeholder"),
    ("participle tail", "The festival grew every year, highlighting the city's role in the scene.", "a.md",
     "participial significance tail"),
    ("participle in a word list", "The editor offers bold, highlighting, and italic options.", "a.md", None),
    ("contrast definition", "The tool is less like a hammer and more like a lens.", "a.md", "definition by contrast"),
    ("negative parallelism", "It's not a bug, it's a feature.", "a.md", "negative parallelism"),
    ("human negation", "It is not possible to rebase a merge, but you can replay it.", "a.md", None),
    ("en dash range", "Pick 1\u20135 items and read pages 10\u201320.", "a.md", None),
    ("spaced en dash", "It works \u2013 mostly.", "a.md", "em dash"),
    ("test harness", "The test harness runs every suite in order.", "a.md", None),
    ("landscape mode", "Rotate the phone to landscape mode, then open the menu.", "a.md", None),
    ("longer list", "It checks names, dates, sizes, and owners.", "a.md", None),
    ("perfect three", "It is fast, simple, and reliable.", "a.md", "perfect three"),
    ("abbreviation split", "Use a short flag, e.g. the one below. It works.", "a.md", None),
    ("inline code", "Run `delve --robust` to start.", "a.md", None),
    # human prose from the git and vim manuals that earlier versions flagged
    ("anchor is not a placeholder", "Read the section [[add-new-command]] first.", "a.md", None),
    ("underscore the character", "The underscore separates the two words.", "a.md", None),
    ("relative-clause negation", "Commits that are not in the branch are saved to a temporary area. "
                                 "This is the same set of commits.", "a.md", None),
    ("parenthetical question", "This will reach most (all?) Linux distributions.", "a.md", None),
    ("question answered by a sentence", "What if you want another language? There are several ways.", "a.md", None),
    ("mid-sentence that said", "The paper cites a study that said the opposite.", "a.md", None),
    ("call to action", "Remember a tool this page is missing, or spotted a detail that is wrong? Submit it here.",
     "a.md", None),
    ("staged imperative still counts", "The fix? Keep it simple.", "a.md", "question then fragment"),
    ("interjections", "Build it and run the tests again, then look at the output to see whether the new "
                      "option shows up where you expect it in the list of commands. Neat!\n\n"
                      "Commit the change with a message that says what it does and why it was needed, "
                      "then send it to the list for review. Great!", "a.md", None),
]


def self_test():
    failed = 0
    for label, text, name, want in SELF_TEST:
        got = [f["pattern"] for f in scan(name, text)]
        ok = (not got) if want is None else any(g.startswith(want) for g in got)
        if not ok:
            failed += 1
            print("FAIL %s: wanted %s, got %s" % (label, want or "clean", got or "clean"))
    pair = scan_files({"buugeng.md": "Buugeng curve. If buugeng are your language, come write it.",
                       "clubs.md": "Clubs spin. If clubs are your language, this chapter is yours to write."})
    if sum(1 for f in pair if f["pattern"] == "slot-swapped template") != 2:
        failed += 1
        print("FAIL slot-swapped template across files: %s" % [f["pattern"] for f in pair])
    manual = scan_files({"usr_02.md": "To delete a character, press x.",
                         "usr_42.md": "To delete a menu, use the unmenu command."})
    if manual:
        failed += 1
        print("FAIL consistent manual phrasing is not a template: %s" % [f["pattern"] for f in manual])
    titles = scan_files({"faq/+page.svelte": "<svelte:head>\n  <title>FAQ | The Kinetic Alphabet</title>\n"
                                             "</svelte:head>\n<h1>Questions</h1>",
                         "support/+page.svelte": "<svelte:head>\n  <title>Support · The Kinetic Alphabet"
                                                 "</title>\n</svelte:head>\n<h1>Support</h1>"})
    if titles:
        failed += 1
        print("FAIL page titles are not a template: %s" % [f["pattern"] for f in titles])
    total = len(SELF_TEST) + 3
    print("self-test: %d/%d passed" % (total - failed, total))
    return 1 if failed else 0


ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Mechanical AI-writing tell scanner.")
    ap.add_argument("files", nargs="*", help="file paths, or - for stdin")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument("--min-severity", default="LOW", choices=list(ORDER))
    ap.add_argument("--format", default="auto", choices=["auto", "markdown", "markup", "code"],
                    help="how to read the files (default: by extension)")
    ap.add_argument("--email", action="store_true",
                    help="treat input as an email body (plain text or HTML): adds hard-wrap, "
                         "sign-off, and markdown checks and skips quoted history")
    ap.add_argument("--require-contact", metavar="REGEX",
                    help="with --email, flag a message whose body and signature lack this pattern")
    ap.add_argument("--self-test", action="store_true", help="run the built-in regression cases")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    if args.self_test:
        return self_test()
    if not args.files:
        ap.error("give at least one file, or - for stdin")

    contents = {}
    for path in args.files:
        if path == "-":
            contents["<stdin>"] = sys.stdin.read()
        else:
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    contents[path] = fh.read()
            except OSError as e:
                print("ai_bust: cannot read %s: %s" % (path, e.strerror or e), file=sys.stderr)
                return 2

    if args.email:
        all_found = []
        for label, content in contents.items():
            all_found += scan_email(label, content, args.require_contact)
    else:
        all_found = scan_files(contents, args.format)

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
