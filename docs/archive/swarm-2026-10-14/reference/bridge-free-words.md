# Bridge-Free TKA Words

Words that generate as TKA sequences with zero bridge letters inserted.

## Why These Work

TKA letters fall into position families. Bridges are needed when consecutive letters cross families. Words that stay within one family need no bridges.

| Group | Letters | Position Family |
|-------|---------|-----------------|
| Alpha/Beta | A, B, C, D, E, F, G, H, I, J, K, L | alpha / beta |
| Gamma | M, N, O, P, Q, R, S, T, U, V | gamma (all sub-positions covered by variations) |

The gamma group is the sweet spot: each letter has 8-16 variations covering all gamma sub-positions, so the builder always finds compatible pairings. Only vowels available are O and U.

The alpha/beta group has an internal state constraint (alpha-ending must feed alpha-starting, beta-ending must feed beta-starting) that severely limits English word formation.

## Verified Bridge-Free Words (Gamma Group)

Filtered from a 370k English word list with regex `^[mnopqrstuv]+$`. All verified to generate with beat count = letters + 1 (no bridge insertions).

| Length | Word | Definition |
|--------|------|------------|
| 12 | UNMONOTONOUS | Not monotonous |
| 11 | UNSUMPTUOUS | Not sumptuous |
| 11 | UNMURMUROUS | Not murmurous |
| 11 | NONTUMOROUS | Not tumorous |
| 11 | NONTORTUOUS | Not tortuous |
| 11 | MONOSTOMOUS | Having a single mouth (biology) |
| 11 | MONOSPOROUS | Producing single spores (biology) |
| 11 | MOTORSPORTS | Motor racing events |
| 10 | MONOTONOUS | Tediously uniform |
| 10 | NONSUPPORT | Failure to support |
| 10 | UNTORTUOUS | Not tortuous |
| 10 | UNSONOROUS | Not sonorous |
| 10 | UNPORTUOUS | Not portuous |
| 10 | STRUMSTRUM | A stringed instrument |
| 10 | PROSUPPORT | In favor of support |
| 10 | MONOTOMOUS | Entomology: genus-related |
| 9 | MONSTROUS | Frighteningly large or ugly |
| 9 | SUMPTUOUS | Splendid and expensive |
| 9 | TORTUROUS | Involving torture or pain |
| 9 | SURMOUNTS | Overcomes (a difficulty) |
| 9 | OUTTRUMPS | Surpasses in trumping |
| 9 | OUTSTUNTS | Surpasses in stunts |
| 9 | SUSURROUS | Whispering, rustling |
| 9 | MURMUROUS | Filled with murmuring |
| 9 | SPONTOONS | A type of polearm (plural) |
| 9 | SOUPSPOON | A spoon for soup |

## Source

Word list: github.com/dwyl/english-words (370,105 entries)
Filter: `grep -iE '^[mnopqrstuv]+$'` sorted by length
Date: Feb 2026
