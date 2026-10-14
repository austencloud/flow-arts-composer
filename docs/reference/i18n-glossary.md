# Flow Arts Composer translation glossary

The shared vocabulary for every locale in `messages/`. Translation workers
follow this before anything else; a value that contradicts a row here is a
defect even when it reads well. Definitions come from the Flow Arts MCP
(`get_alphabet_info`, `get_term_definition`) and from the German catalog, which
Austen has used in the app since September 2026. German renderings are the
reference; the other nine columns are proposals until the review log at the
end says otherwise.

Locales: `de`, `es`, `fr`, `it`, `pt` (Brazilian), `ja`, `ru`, `ko`, `zh`
(Simplified), `ar`. English is the source and never edited by translators.

## 1. Never translate

These stay exactly as written, in every locale and every script. The
`post_*` and `verified_*` prose is full of them.

| Term                                                                                                                      | Notes                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TKA, The Kinetic Alphabet                                                                                                 | Brand. German keeps "The Kinetic Alphabet" as well.                                                                                                                                                                                                |
| Flow Arts Composer                                                                                                        | App name (`app_name`).                                                                                                                                                                                                                             |
| LOOP, CAP, VTG, Vulcan Tech Gospel                                                                                        | Notation systems. "LOOP-Typ" style compounds are fine.                                                                                                                                                                                             |
| Codex, TIKA, Post Studio, Scribe, Composer (the product)                                                                  | Product surfaces.                                                                                                                                                                                                                                  |
| Choreo Cards                                                                                                              | Product. German already uses "Choreo-Karten" in the app; keep that in `de` and the English name elsewhere.                                                                                                                                         |
| Letters: A–Z, α β γ Σ Δ θ Ω Φ Ψ Λ and the dash forms (Σ-, Φ-)                                                             | Notation. Never transliterate.                                                                                                                                                                                                                     |
| Grid points: N, E, S, W, NE, SE, SW, NW                                                                                   | Single-letter point names stay Latin. The spelled-out compass words translate (north → Norden).                                                                                                                                                    |
| Motion categories: Shift, Dash, Hash, Float, Pro, Anti                                                                    | TKA jargon; every locale keeps them, CJK and Cyrillic included. "Dual-Shift", "Cross-Shift", "Dual-Dash" likewise.                                                                                                                                 |
| Prospin, Antispin, Inspin, Isolation, Extension, Flower, Petal                                                            | Flow arts jargon. Latin-script locales keep them. `ja`, `ko` may use the community katakana/hangul loanwords (プロスピン, 안티스핀); `ru` may use the community Cyrillic loanwords (проспин, антиспин, изоляция, экстеншн). `zh`, `ar` keep Latin. |
| VTG labels: Split-Same, Split-Opp, Tog-Same, Tog-Opp, Quarter-Same, Quarter-Opp                                           | The hyphenated notation label stays English. Prose that explains it translates (see section 6).                                                                                                                                                    |
| Placement names: Alpha, Beta, Gamma, Zeta, Eta, Tau, Terra                                                                | Latin-script locales keep them. `ja` アルファ/ベータ/ガンマ, `ru` Альфа/Бета/Гамма, `ko` 알파/베타/감마, `zh` Alpha/Beta/Gamma, `ar` ألفا/بيتا/غاما. Zeta/Eta/Tau/Terra follow the same pattern.                                                   |
| Prop names that are already loanwords: Poi, Buugeng, Triad, Ukulele                                                       | Keep.                                                                                                                                                                                                                                              |
| BPM, FPS, QR, PDF, PNG, MP4, URL, 3D, 4K                                                                                  | Units and formats.                                                                                                                                                                                                                                 |
| Sequence words, letters in a word, user names, user titles, collection names, effect identifiers, canonical filter values | User and catalog data. These never pass through `t()`; if a key seems to contain one, stop and report it.                                                                                                                                          |
| `{placeholders}`                                                                                                          | Same name, same braces, same count. Reorder freely.                                                                                                                                                                                                |
| `<strong>`, `<em>`, `<br>`                                                                                                | The only markup allowed. Wrap the locale's own emphasized words; do not mirror English positions.                                                                                                                                                  |

## 2. Placements (where the hands are)

| English                         | Meaning                               | de                          | es                       | fr                             | it                          | pt                      | ja                              | ru                           | ko                    | zh                  | ar                     |
| ------------------------------- | ------------------------------------- | --------------------------- | ------------------------ | ------------------------------ | --------------------------- | ----------------------- | ------------------------------- | ---------------------------- | --------------------- | ------------------- | ---------------------- |
| placement                       | hand position pair on the grid        | Position                    | posición                 | position                       | posizione                   | posição                 | ポジション                      | позиция                      | 위치                  | 位置                | موضع                   |
| start placement / end placement |                                       | Startposition / Endposition | posición inicial / final | position de départ / d'arrivée | posizione iniziale / finale | posição inicial / final | 開始ポジション / 終了ポジション | начальная / конечная позиция | 시작 위치 / 종료 위치 | 起始位置 / 结束位置 | موضع البداية / النهاية |
| opposite points (alpha)         |                                       | gegenüberliegende Punkte    | puntos opuestos          | points opposés                 | punti opposti               | pontos opostos          | 対向する点                      | противоположные точки        | 반대 지점             | 相对的点            | نقاط متقابلة           |
| hands together (beta)           |                                       | Hände zusammen              | manos juntas             | mains ensemble                 | mani insieme                | mãos juntas             | 両手を揃える                    | руки вместе                  | 두 손 모음            | 双手并拢            | اليدان معًا            |
| right angle (gamma)             |                                       | rechter Winkel              | ángulo recto             | angle droit                    | angolo retto                | ângulo reto             | 直角                            | прямой угол                  | 직각                  | 直角                | زاوية قائمة            |
| centric placement               | one or both hands at center (Level 4) | zentrische Position         | posición céntrica        | position centrée               | posizione centrica          | posição cêntrica        | センターポジション              | центрическая позиция         | 중심 위치             | 中心位置            | موضع مركزي             |
| skewed placement                | obtuse/acute (Level 5)                | schiefgelegene Position     | posición sesgada         | position oblique               | posizione obliqua           | posição inclinada       | 斜めポジション                  | скошенная позиция            | 기울어진 위치         | 倾斜位置            | موضع مائل              |

## 3. Hand paths and prop rotation

| English                              | Meaning                                                                         | de                           | es                               | fr                          | it                       | pt                              | ja                    | ru                          | ko                  | zh              | ar                      |
| ------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- | --------------------------- | ------------------------ | ------------------------------- | --------------------- | --------------------------- | ------------------- | --------------- | ----------------------- |
| hand path                            | how the hand travels between points                                             | Handpfad                     | trayectoria de la mano           | trajectoire de la main      | percorso della mano      | trajetória da mão               | ハンドパス            | траектория руки             | 손 경로             | 手部路径        | مسار اليد               |
| hand motion                          |                                                                                 | Handbewegung                 | movimiento de la mano            | mouvement de la main        | movimento della mano     | movimento da mão                | 手の動き              | движение руки               | 손 동작             | 手部动作        | حركة اليد               |
| static (adjective, "stays in place") | the Static category keeps its English name as a label; prose uses the adjective | statisch                     | estático                         | statique                    | statico                  | estático                        | 静止                  | статичный                   | 정지                | 静止            | ثابت                    |
| turn, turns                          | prop rotation count                                                             | Drehung, Drehungen           | vuelta, vueltas                  | tour, tours                 | giro, giri               | volta, voltas                   | 回転                  | оборот, обороты             | 회전                | 转              | دورة، دورات             |
| whole turns / half turns             |                                                                                 | ganze / halbe Drehungen      | vueltas enteras / medias vueltas | tours complets / demi-tours | giri interi / mezzi giri | voltas completas / meias voltas | 全回転 / 半回転       | полные / половинные обороты | 전체 회전 / 반 회전 | 整转 / 半转     | دورات كاملة / نصف دورات |
| rotation direction                   |                                                                                 | Drehrichtung                 | sentido de giro                  | sens de rotation            | senso di rotazione       | sentido de rotação              | 回転方向              | направление вращения        | 회전 방향           | 旋转方向        | اتجاه الدوران           |
| clockwise / counterclockwise         |                                                                                 | im / gegen den Uhrzeigersinn | horario / antihorario            | horaire / antihoraire       | orario / antiorario      | horário / anti-horário          | 時計回り / 反時計回り | по / против часовой стрелки | 시계 / 반시계 방향  | 顺时针 / 逆时针 | مع / عكس عقارب الساعة   |
| rotation (prop spin)                 |                                                                                 | Drehung                      | rotación                         | rotation                    | rotazione                | rotação                         | 回転                  | вращение                    | 회전                | 旋转            | دوران                   |

## 4. Orientations (where the prop points)

Short labels fit a chip; hints are full phrases. The interradial compounds
(clock-in, counter-out) join the two short labels with the locale's own
connector, the way German writes "Mit–innen".

| English             | de short / hint                 | es                    | fr                 | it                  | pt                    | ja                  | ru                    | ko                        | zh                | ar               |
| ------------------- | ------------------------------- | --------------------- | ------------------ | ------------------- | --------------------- | ------------------- | --------------------- | ------------------------- | ----------------- | ---------------- | ----------------- |
| in                  | Nach innen / innen              | hacia dentro          | vers l'intérieur   | verso l'interno     | para dentro           | 内向き              | внутрь                | 안쪽                      | 向内              | للداخل           |
| out                 | Nach außen / außen              | hacia fuera           | vers l'extérieur   | verso l'esterno     | para fora             | 外向き              | наружу                | 바깥쪽                    | 向外              | للخارج           |
| clock               | Mit / Im Uhrzeigersinn          | horario               | horaire            | orario              | horário               | 時計回り            | по часовой            | 시계 방향                 | 顺时针            | مع عقارب الساعة  |
| counter             | Gegen / Gegen den Uhrzeigersinn | antihorario           | antihoraire        | antiorario          | anti-horário          | 反時計回り          | против часовой        | 반시계 방향               | 逆时针            | عكس عقارب الساعة |
| radial / non-radial |                                 | radial / nicht radial | radial / no radial | radial / non radial | radiale / non radiale | radial / não radial | ラジアル / 非ラジアル | радиальный / нерадиальный | 방사형 / 비방사형 | 径向 / 非径向    | شعاعي / غير شعاعي |
| orientation         |                                 | Ausrichtung           | orientación        | orientation         | orientamento          | orientação          | 向き                  | ориентация                | 방향              | 朝向             | اتجاه             |

## 5. Grids, levels, types

| English                | de                 | es                  | fr                 | it                | pt              | ja             | ru                | ko          | zh       | ar               |
| ---------------------- | ------------------ | ------------------- | ------------------ | ----------------- | --------------- | -------------- | ----------------- | ----------- | -------- | ---------------- |
| grid                   | Gitter             | cuadrícula          | grille             | griglia           | grade           | グリッド       | сетка             | 그리드      | 网格     | شبكة             |
| Diamond (grid)         | Raute              | Diamante            | Diamant            | Diamante          | Diamante        | ダイヤモンド   | Ромб              | 다이아몬드  | 菱形     | معين             |
| Box (grid)             | Quadrat            | Cuadrado            | Carré              | Quadrato          | Quadrado        | ボックス       | Квадрат           | 박스        | 方形     | مربع             |
| Mixed / Skewed grid    | Gemischtes Gitter  | cuadrícula mixta    | grille mixte       | griglia mista     | grade mista     | 混合グリッド   | смешанная сетка   | 혼합 그리드 | 混合网格 | شبكة مختلطة      |
| Conjoined grid         | Verbundenes Gitter | cuadrícula conjunta | grille conjointe   | griglia congiunta | grade conjugada | 連結グリッド   | сопряжённая сетка | 결합 그리드 | 联结网格 | شبكة مترابطة     |
| center point           | Mittelpunkt        | punto central       | point central      | punto centrale    | ponto central   | 中心点         | центральная точка | 중심점      | 中心点   | النقطة المركزية  |
| Level 1 … Level 9      | Level 1            | Nivel 1             | Niveau 1           | Livello 1         | Nível 1         | レベル1        | Уровень 1         | 레벨 1      | 级别 1   | المستوى 1        |
| Type 1 … Type 6        | Typ 1              | Tipo 1              | Type 1             | Tipo 1            | Tipo 1          | タイプ1        | Тип 1             | 유형 1      | 类型 1   | النوع 1          |
| Base motions (Level 1) | Grundbewegungen    | movimientos base    | mouvements de base | movimenti base    | movimentos base | 基本モーション | базовые движения  | 기본 동작   | 基础动作 | الحركات الأساسية |

The German catalog currently mixes "Level", "Stufe" and "Ebene" for the same
concept (59 keys use Stufe/Ebene). "Level" is the glossary choice; the German
finishing batch unifies it.

The German catalog also mixes "Gitter" (46 values) and "Raster" (78 values)
for the grid. "Gitter" is the glossary choice because the user-facing
chips (`browse_chip_grid_mode`, `generator_grid`) already use it.

## 6. Timing and direction (VTG)

The hyphenated labels stay English (section 1). When a sentence describes
the timing, use these words.

| English                                    | de                                        | es                | fr                  | it                | pt             | ja           | ru                             | ko         | zh           | ar            |
| ------------------------------------------ | ----------------------------------------- | ----------------- | ------------------- | ----------------- | -------------- | ------------ | ------------------------------ | ---------- | ------------ | ------------- |
| together (hands hit the downbeat together) | zusammen                                  | juntas            | ensemble            | insieme           | juntas         | 同時         | вместе                         | 함께       | 同时         | معًا          |
| split (half a cycle apart)                 | versetzt                                  | alternadas        | décalées            | alternate         | alternadas     | 交互         | вразнобой (со сдвигом)         | 엇갈림     | 交替         | متناوب        |
| quarter (a quarter cycle apart)            | viertelversetzt                           | a un cuarto       | décalées d'un quart | a un quarto       | a um quarto    | 4分の1ずれ   | со сдвигом на четверть         | 1/4 엇갈림 | 四分之一交错 | بربع دورة     |
| same direction                             | gleiche Richtung / gleichsinnig           | misma dirección   | même sens           | stessa direzione  | mesma direção  | 同方向       | в одном направлении            | 같은 방향  | 同向         | نفس الاتجاه   |
| opposite direction                         | entgegengesetzte Richtung / gegensinnig   | dirección opuesta | sens opposé         | direzione opposta | direção oposta | 逆方向       | в противоположных направлениях | 반대 방향  | 反向         | اتجاه معاكس   |
| downbeat                                   | Grundschlag (prose), Downbeat (timing UI) | tiempo fuerte     | temps fort          | battere           | tempo forte    | ダウンビート | сильная доля                   | 다운비트   | 强拍         | النبضة القوية |
| timing                                     | Timing                                    | sincronización    | timing              | timing            | timing         | タイミング   | тайминг                        | 타이밍     | 节奏时机     | التوقيت       |
| direction                                  | Richtung                                  | dirección         | direction           | direzione         | direção        | 方向         | направление                    | 방향       | 方向         | الاتجاه       |

## 7. LOOP transforms

| English                         | de                    | es                      | fr                     | it                 | pt                       | ja            | ru                    | ko            | zh          | ar                |
| ------------------------------- | --------------------- | ----------------------- | ---------------------- | ------------------ | ------------------------ | ------------- | --------------------- | ------------- | ----------- | ----------------- |
| Mirrored                        | Gespiegelt            | Espejado                | Miroir                 | Speculare          | Espelhado                | ミラー        | Зеркальный            | 미러          | 镜像        | معكوس             |
| Rotated                         | Rotiert               | Rotado                  | Pivoté                 | Ruotato            | Rotacionado              | 回転          | Повёрнутый            | 회전          | 旋转        | مُدار             |
| Inverted                        | Invertiert            | Invertido               | Inversé                | Invertito          | Invertido                | 反転          | Инвертированный       | 반전          | 反转        | مقلوب             |
| Swapped                         | Getauscht             | Intercambiado           | Échangé                | Scambiato          | Trocado                  | 入れ替え      | С перестановкой       | 교체          | 交换        | مُبدَّل           |
| reflection (across an axis)     | Spiegelung            | reflexión               | réflexion              | riflessione        | reflexão                 | 反射          | отражение             | 반사          | 反射        | انعكاس            |
| Quartered / Halved (period)     | Geviertelt / Halbiert | En cuartos / A la mitad | En quarts / En moitiés | In quarti / A metà | Em quartos / Pela metade | 4分割 / 2分割 | На четверти / Пополам | 4등분 / 2등분 | 四分 / 二分 | مُربَّع / مُنصَّف |
| extend (a sequence with a LOOP) | verlängern            | extender                | prolonger              | estendere          | estender                 | 延長          | продлить              | 확장          | 延长        | تمديد             |

## 8. Units of a sequence

| English     | Meaning                                                                | de          | es          | fr           | it          | pt              | ja             | ru                 | ko         | zh         | ar            |
| ----------- | ---------------------------------------------------------------------- | ----------- | ----------- | ------------ | ----------- | --------------- | -------------- | ------------------ | ---------- | ---------- | ------------- |
| sequence    | the whole piece                                                        | Sequenz     | secuencia   | séquence     | sequenza    | sequência       | シーケンス     | последовательность | 시퀀스     | 序列       | تسلسل         |
| word        | the letter string naming a sequence; the value itself never translates | Wort        | palabra     | mot          | parola      | palavra         | ワード         | слово              | 단어       | 单词       | كلمة          |
| letter      |                                                                        | Buchstabe   | letra       | lettre       | lettera     | letra           | 文字           | буква              | 문자       | 字母       | حرف           |
| pictograph  | one notation card                                                      | Piktogramm  | pictograma  | pictogramme  | pittogramma | pictograma      | ピクトグラム   | пиктограмма        | 픽토그램   | 象形图     | رمز تصويري    |
| step        | one position in the sequence (what the viewer steps through)           | Schritt     | paso        | étape        | passo       | passo           | ステップ       | шаг                | 단계       | 步         | خطوة          |
| beat        | a musical count; also the sequence unit in Compose and Practice        | Beat        | tiempo      | temps        | battito     | batida          | ビート         | доля               | 비트       | 拍         | نبضة          |
| duration    |                                                                        | Dauer       | duración    | durée        | durata      | duração         | 長さ           | длительность       | 길이       | 时长       | المدة         |
| tempo / BPM |                                                                        | Tempo / BPM | tempo / BPM | tempo / BPM  | tempo / BPM | andamento / BPM | テンポ / BPM   | темп / BPM         | 템포 / BPM | 速度 / BPM | الإيقاع / BPM |
| variation   |                                                                        | Variation   | variación   | variante     | variante    | variação        | バリエーション | вариация           | 변형       | 变体       | تنويع         |
| collection  |                                                                        | Sammlung    | colección   | collection   | raccolta    | coleção         | コレクション   | коллекция          | 컬렉션     | 合集       | مجموعة        |
| library     | the user's own sequences                                               | Bibliothek  | biblioteca  | bibliothèque | libreria    | biblioteca      | ライブラリ     | библиотека         | 라이브러리 | 库         | المكتبة       |
| performer   |                                                                        | Performer   | intérprete  | artiste      | performer   | performer       | パフォーマー   | исполнитель        | 퍼포머     | 表演者     | مؤدٍّ         |

German uses "Schritt" for a sequence position even where English says
"beat" (`train_auto_advance`). Follow the meaning, not the English word: a
position in the sequence is a step; a musical count is a beat.

## 9. Props and hands

| English                | de                   | es                       | fr                      | it                       | pt                     | ja                        | ru                    | ko                   | zh          | ar                     |
| ---------------------- | -------------------- | ------------------------ | ----------------------- | ------------------------ | ---------------------- | ------------------------- | --------------------- | -------------------- | ----------- | ---------------------- |
| prop, props            | Requisit, Requisiten | prop, props              | accessoire, accessoires | attrezzo, attrezzi       | prop, props            | プロップ                  | реквизит              | 프롭                 | 道具        | أداة، أدوات            |
| staff / double staff   | Stab / Doppelstab    | bastón / bastón doble    | bâton / bâton double    | bastone / bastone doppio | bastão / bastão duplo  | スタッフ / ダブルスタッフ | посох / двойной посох | 스태프 / 더블 스태프 | 棍 / 双棍   | عصا / عصا مزدوجة       |
| fan, fans              | Fächer               | abanico, abanicos        | éventail, éventails     | ventaglio, ventagli      | leque, leques          | ファン                    | веер, веера           | 부채                 | 扇          | مروحة، مراوح           |
| hoop                   | Reifen               | aro                      | cerceau                 | cerchio                  | bambolê                | フープ                    | обруч                 | 후프                 | 呼啦圈      | طوق                    |
| club, clubs            | Keule, Keulen        | clava, clavas            | massue, massues         | clava, clave             | clava, clavas          | クラブ                    | булава, булавы        | 클럽                 | 棒          | هراوة، هراوات          |
| sword                  | Schwert              | espada                   | épée                    | spada                    | espada                 | 剣                        | меч                   | 검                   | 剑          | سيف                    |
| big / mini (prop size) | Großer / Kleiner     | grande / mini            | grand / mini            | grande / mini            | grande / mini          | ビッグ / ミニ             | большой / мини        | 빅 / 미니            | 大 / 迷你   | كبير / صغير            |
| left hand / right hand | linke / rechte Hand  | mano izquierda / derecha | main gauche / droite    | mano sinistra / destra   | mão esquerda / direita | 左手 / 右手               | левая / правая рука   | 왼손 / 오른손        | 左手 / 右手 | اليد اليسرى / اليمنى   |
| blue hand / red hand   | blaue / rote Hand    | mano azul / roja         | main bleue / rouge      | mano blu / rossa         | mão azul / vermelha    | 青い手 / 赤い手           | синяя / красная рука  | 파란 손 / 빨간 손    | 蓝手 / 红手 | اليد الزرقاء / الحمراء |
| chirality (buugeng)    | Ausrichtung          | quiralidad               | chiralité               | chiralità                | quiralidade            | 向き                      | хиральность           | 방향성               | 手性        | التجانس اليدوي         |

Spanish and Portuguese flow artists use "props" as a loanword; `es` and `pt`
keep it until a native reviewer objects.

## 10. App surfaces

Module and tab names are navigation labels; keep them one or two words.

| English                      | de                  | es                             | fr                            | it              | pt               | ja                    | ru            | ko                | zh              | ar                          |
| ---------------------------- | ------------------- | ------------------------------ | ----------------------------- | --------------- | ---------------- | --------------------- | ------------- | ----------------- | --------------- | --------------------------- |
| Create                       | Erstellen           | Crear                          | Créer                         | Crea            | Criar            | クリエイト            | Создать       | 만들기            | 创作            | إنشاء                       |
| Browse                       | Durchsuchen         | Explorar                       | Parcourir                     | Sfoglia         | Navegar          | ブラウズ              | Обзор         | 찾아보기          | 浏览            | تصفح                        |
| Learn                        | Lernen              | Aprender                       | Apprendre                     | Impara          | Aprender         | 学習                  | Обучение      | 배우기            | 学习            | تعلّم                       |
| Practice (module `train`)    | Üben                | Práctica                       | Entraînement                  | Pratica         | Treinar          | 練習                  | Практика      | 연습              | 练习            | تدريب                       |
| Compose                      | Komponieren         | Componer                       | Composer                      | Componi         | Compor           | コンポーズ            | Композиция    | 작곡              | 编排            | تأليف                       |
| Settings                     | Einstellungen       | Ajustes                        | Paramètres                    | Impostazioni    | Configurações    | 設定                  | Настройки     | 설정              | 设置            | الإعدادات                   |
| Library                      | Bibliothek          | Biblioteca                     | Bibliothèque                  | Libreria        | Biblioteca       | ライブラリ            | Библиотека    | 라이브러리        | 库              | المكتبة                     |
| Share                        | Teilen              | Compartir                      | Partager                      | Condividi       | Compartilhar     | 共有                  | Поделиться    | 공유              | 分享            | مشاركة                      |
| Viewer                       | Viewer              | Visor                          | Visionneuse                   | Visualizzatore  | Visualizador     | ビューア              | Просмотр      | 뷰어              | 查看器          | العارض                      |
| Guide                        | Leitfaden           | Guía                           | Guide                         | Guida           | Guia             | ガイド                | Руководство   | 가이드            | 指南            | الدليل                      |
| Inbox                        | Posteingang         | Bandeja de entrada             | Boîte de réception            | Posta in arrivo | Caixa de entrada | 受信箱                | Входящие      | 받은편지함        | 收件箱          | الوارد                      |
| Sign in / Sign out           | Anmelden / Abmelden | Iniciar sesión / Cerrar sesión | Se connecter / Se déconnecter | Accedi / Esci   | Entrar / Sair    | ログイン / ログアウト | Войти / Выйти | 로그인 / 로그아웃 | 登录 / 退出登录 | تسجيل الدخول / تسجيل الخروج |
| effect (visual trail effect) | Effekt              | efecto                         | effet                         | effetto         | efeito           | エフェクト            | эффект        | 효과              | 效果            | تأثير                       |

## 11. Voice and formality

| Locale | Address                | Notes                                                                                                                                                                         |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| de     | du                     | Decided in `de.json` (546 du-forms). 26 leftover Sie-forms get fixed in the German finishing batch. Imperatives for buttons ("Speichern"), infinitive style for menu entries. |
| es     | tú                     | Neutral Latin American vocabulary; no vosotros.                                                                                                                               |
| fr     | tu                     | Matches the casual voice of the German. Buttons use the infinitive ("Enregistrer").                                                                                           |
| it     | tu                     | Buttons use the second-person imperative ("Salva"), the Italian app convention.                                                                                               |
| pt     | você (Brazilian)       | Brazilian spelling and vocabulary ("bambolê", "salvar").                                                                                                                      |
| ja     | です・ます polite      | Short labels drop the copula; sentences keep polite form. Katakana loanwords for flow arts jargon.                                                                            |
| ru     | вы (lowercase)         | Standard UI register.                                                                                                                                                         |
| ko     | 해요체                 | Short labels as noun phrases ("저장"); sentences polite informal.                                                                                                             |
| zh     | 你                     | Simplified characters, no 您.                                                                                                                                                 |
| ar     | Modern Standard Arabic | Neutral imperative for buttons. Natural phrasing only; the browser handles direction, so never insert directional marks or reorder for RTL.                                   |

Length: German runs about 30% longer than English, Russian and French about
20%, CJK shorter. Chips and buttons (keys ending in `_short`, `_chip`,
`_label`, `_button` and all `tab_*`) must stay one line; prefer a shorter
synonym over an abbreviation.

## 12. Review log

Native review is Austen's or the community's. Record who reviewed what.

| Date       | Locale | Scope                                          | Reviewer             | Outcome                                                    |
| ---------- | ------ | ---------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| 2026-09-25 | de     | Create, Browse, Viewer, Share, Settings, Learn | Austen (in-app use)  | Accepted; terminology choices above                        |
| 2026-10-14 | all    | This glossary, first draft                     | Claude (coordinator) | Proposals; `de` column from the catalog, others unreviewed |
