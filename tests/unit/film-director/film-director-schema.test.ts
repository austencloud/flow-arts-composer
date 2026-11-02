// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import { sampleFilmDirector } from "../../../src/routes/test/film-director/_lib/sample-film-director";
import {
  FILM_DIRECTOR_DIRECTIVE_AXES,
  FILM_DIRECTOR_SCHEMA_VERSION_3,
  FILM_DIRECTOR_SCHEMA_VERSION_4,
  FILM_DIRECTOR_SCHEMA_VERSION_5,
  FilmDirectorInputSchema,
} from "../../../src/routes/test/film-director/_lib/film-director-schema";

describe("film director scene language", () => {
  it("fills contextual defaults into a deterministic, complete scene", () => {
    const film = resolveFilmDirectorSpec({
      version: 1,
      id: "default-proof",
      title: "Default proof",
      scenes: [
        {
          id: "bubbles",
          title: "Bubbles",
          performance: {
            performers: [{ effect: "bubbles" }, { effect: "bubbles" }],
          },
          effectOverrides: { bubbles: { size: 0.35 } },
        },
      ],
    });

    const scene = film.scenes[0]!;
    expect(film.format).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(scene.location.environmentId).toBe("ocean");
    expect(scene.performance.formation).toBe("grid-2x2");
    expect(scene.performance.performers).toHaveLength(2);
    expect(scene.performance.performers[0]).toMatchObject({
      id: "performer-1",
      prop: "staff",
      effort: "linear",
      beatOffset: 0,
    });
    expect(scene.camera.keyframes[0]!.atSeconds).toBe(0);
    expect(scene.effectOverrides).toEqual({ bubbles: { size: 0.35 } });
    expect(film.durationSeconds).toBe(8);
  });

  it("rejects a cast member that is not deployed", () => {
    expect(() =>
      resolveFilmDirectorSpec({
        version: 1,
        id: "bad-character",
        title: "Bad character",
        scenes: [
          {
            id: "scene",
            title: "Scene",
            performance: { performers: [{ characterId: "astronaut" }] },
          },
        ],
      })
    ).toThrow(/not in the deployed 3D catalog/);
  });

  it("rejects a named effect preset that does not exist", () => {
    expect(() =>
      resolveFilmDirectorSpec({
        version: 1,
        id: "bad-preset",
        title: "Bad preset",
        scenes: [
          {
            id: "scene",
            title: "Scene",
            effectPresets: { fire: "fire-imaginary" },
          },
        ],
      })
    ).toThrow(/has no preset/);
  });

  it("samples one-count performer offsets from the active scene", () => {
    const film = resolveFilmDirectorSpec({
      version: 1,
      id: "canon",
      title: "Canon",
      playback: { loop: false, autoplay: false },
      scenes: [
        {
          id: "tunnel",
          title: "Tunnel",
          durationSeconds: 10,
          performance: {
            bpm: 60,
            formation: "tunnel-stack",
            performers: [
              { id: "a", beatOffset: 0 },
              { id: "b", beatOffset: -1 },
              { id: "c", beatOffset: -2 },
            ],
          },
        },
      ],
    });

    const frame = sampleFilmDirector(film, 3.5);
    expect(frame.sequenceStep).toBeCloseTo(3.5);
    expect(frame.performerStepOffsets).toEqual([0, -1, -2]);
  });

  it("accepts version 2 with seed, cast defaults, and directives", () => {
    const parsed = FilmDirectorInputSchema.parse({
      version: 2,
      id: "v2-film",
      title: "V2",
      seed: { base: 7, axes: { prop: 1 } },
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: {
            cast: {
              count: 8,
              defaults: { prop: { pick: "distinct" }, effect: "fire" },
              performers: [{ id: "performer-3", effect: "led" }],
            },
          },
        },
      ],
    });
    expect(parsed.version).toBe(2);
  });

  it("accepts schema version 3", () => {
    const parsed = FilmDirectorInputSchema.parse({
      version: FILM_DIRECTOR_SCHEMA_VERSION_3,
      id: "v3-film",
      title: "V3",
      scenes: [{ id: "s1", title: "S1" }],
    });
    expect(parsed.version).toBe(3);
  });

  it("uses characterId in schema version 4", () => {
    const parsed = FilmDirectorInputSchema.parse({
      version: FILM_DIRECTOR_SCHEMA_VERSION_4,
      id: "v4-film",
      title: "V4",
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: { performers: [{ characterId: "ch01" }] },
        },
      ],
    });
    expect(parsed.scenes[0]?.performance?.performers?.[0]).toMatchObject({
      characterId: "ch01",
    });
  });

  it("normalizes version-4 hand fields without changing seeded plane picks", () => {
    const legacy = FilmDirectorInputSchema.parse({
      version: FILM_DIRECTOR_SCHEMA_VERSION_4,
      id: "hand-migration",
      title: "Hand migration",
      seed: { axes: { bluePlane: 7, redPlane: 11 } },
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: {
            cast: {
              count: 3,
              defaults: {
                bluePlane: { pick: "distinct" },
                redPlane: { pick: "distinct" },
              },
              performers: [
                {
                  id: "performer-1",
                  stepPlanes: [
                    { step: 2, hand: "blue", plane: { pick: "any" } },
                  ],
                },
              ],
            },
          },
        },
      ],
    });
    const canonical = FilmDirectorInputSchema.parse({
      version: FILM_DIRECTOR_SCHEMA_VERSION_5,
      id: "hand-migration",
      title: "Hand migration",
      seed: { axes: { leftPlane: 7, rightPlane: 11 } },
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: {
            cast: {
              count: 3,
              defaults: {
                leftPlane: { pick: "distinct" },
                rightPlane: { pick: "distinct" },
              },
              performers: [
                {
                  id: "performer-1",
                  stepPlanes: [
                    { step: 2, hand: "left", plane: { pick: "any" } },
                  ],
                },
              ],
            },
          },
        },
      ],
    });

    const legacyResolved = resolveFilmDirectorSpec(legacy);
    const canonicalResolved = resolveFilmDirectorSpec(canonical);
    expect(legacyResolved.scenes[0]!.performance.performers).toEqual(
      canonicalResolved.scenes[0]!.performance.performers
    );
  });

  it("migrates avatarId only for legacy film versions", () => {
    const legacy = FilmDirectorInputSchema.parse({
      version: FILM_DIRECTOR_SCHEMA_VERSION_3,
      id: "legacy-character-field",
      title: "Legacy character field",
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: { performers: [{ avatarId: "ch01" }] },
        },
      ],
    });
    expect(legacy.scenes[0]?.performance?.performers?.[0]).toMatchObject({
      characterId: "ch01",
    });

    expect(() =>
      FilmDirectorInputSchema.parse({
        version: FILM_DIRECTOR_SCHEMA_VERSION_4,
        id: "v4-legacy-field",
        title: "V4 legacy field",
        scenes: [
          {
            id: "s1",
            title: "S1",
            performance: { performers: [{ avatarId: "ch01" }] },
          },
        ],
      })
    ).toThrow(/avatarId/);
  });

  it("upgrades legacy scene units and location fields before validation", () => {
    const parsed = FilmDirectorInputSchema.parse({
      version: 1,
      id: "v1-film",
      title: "V1",
      shots: [
        {
          id: "s1",
          title: "S1",
          scene: { environmentId: "forest", showStage: true },
        },
      ],
    });
    expect(parsed.version).toBe(1);
    expect(parsed).not.toHaveProperty("shots");
    expect(parsed.scenes[0]!.location).toEqual({
      environmentId: "forest",
      showStage: true,
    });
  });

  it("rejects documents containing both scenes and shots", () => {
    expect(() =>
      FilmDirectorInputSchema.parse({
        version: 2,
        id: "ambiguous-units",
        title: "Ambiguous units",
        shots: [{ id: "legacy", title: "Legacy" }],
        scenes: [{ id: "current", title: "Current" }],
      })
    ).toThrow(/both "shots" and "scenes"/);
  });

  it("rejects a unit containing both scene and location", () => {
    expect(() =>
      FilmDirectorInputSchema.parse({
        version: 2,
        id: "ambiguous-location",
        title: "Ambiguous location",
        scenes: [
          {
            id: "s1",
            title: "S1",
            scene: { environmentId: "forest" },
            location: { environmentId: "ocean" },
          },
        ],
      })
    ).toThrow(/both "scene" and "location"/);
  });

  it("rejects both a cast block and a bare performers array", () => {
    expect(() =>
      FilmDirectorInputSchema.parse({
        version: 2,
        id: "x",
        title: "X",
        scenes: [
          {
            id: "s1",
            title: "S1",
            performance: {
              cast: { count: 2 },
              performers: [{}, {}],
            },
          },
        ],
      })
    ).toThrow(/cast/i);
  });

  it("rejects unknown directive keys and exports the axis list", () => {
    expect(() =>
      FilmDirectorInputSchema.parse({
        version: 2,
        id: "x",
        title: "X",
        scenes: [
          {
            id: "s1",
            title: "S1",
            performance: {
              cast: { count: 1, defaults: { prop: { grab: "any" } } },
            },
          },
        ],
      })
    ).toThrow();
    expect(FILM_DIRECTOR_DIRECTIVE_AXES).toContain("prop");
    expect(FILM_DIRECTOR_DIRECTIVE_AXES).toContain("environmentId");
  });
});

describe("beats as a time unit", () => {
  const beatsFilm = (scene: Record<string, unknown>) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_4,
    id: "beats-film",
    title: "Beats",
    scenes: [{ id: "s1", title: "S1", ...scene }],
  });

  it("accepts version 4", () => {
    const parsed = FilmDirectorInputSchema.parse(beatsFilm({}));
    expect(parsed.version).toBe(4);
  });

  it("accepts durationBeats on a scene and rejects both units at once", () => {
    const parsed = FilmDirectorInputSchema.parse(
      beatsFilm({ durationBeats: 16 })
    );
    expect(parsed.scenes[0]!.durationBeats).toBe(16);
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({ durationSeconds: 8, durationBeats: 16 })
      )
    ).toThrow(/exactly one of/i);
  });

  it("accepts durationBeats on transitions, blocking moves, scene blocking, and camera moves", () => {
    const parsed = FilmDirectorInputSchema.parse(
      beatsFilm({
        durationBeats: 16,
        transition: { kind: "cut", durationBeats: 2 },
        performance: {
          bpm: 120,
          blocking: { endFormation: "line", durationBeats: 8 },
          cast: {
            count: 2,
            performers: [
              {
                id: "performer-2",
                blocking: [
                  { move: "walk", to: { x: 1, z: 0 }, durationBeats: 4 },
                  { move: "stand" },
                ],
              },
            ],
          },
        },
        camera: {
          shotSize: "medium",
          moves: [
            { move: "push-in", durationBeats: 8 },
            { move: "hold", durationBeats: 8 },
          ],
        },
      })
    );
    expect(parsed.scenes[0]!.transition?.durationBeats).toBe(2);
    expect(parsed.scenes[0]!.performance?.blocking?.durationBeats).toBe(8);
    expect(
      parsed.scenes[0]!.performance?.cast?.performers?.[0]?.blocking?.[0]
        ?.durationBeats
    ).toBe(4);
    expect(parsed.scenes[0]!.camera?.moves?.[0]?.durationBeats).toBe(8);
  });

  it("rejects stating both units on a transition, a blocking move, a scene blocking, or a camera move", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({
          transition: { kind: "cut", durationSeconds: 1, durationBeats: 2 },
        })
      )
    ).toThrow(/exactly one of/i);
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({
          performance: {
            performers: [
              {
                blocking: [
                  {
                    move: "walk",
                    to: { x: 1, z: 0 },
                    durationSeconds: 2,
                    durationBeats: 4,
                  },
                ],
              },
            ],
          },
        })
      )
    ).toThrow(/exactly one of/i);
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({
          performance: {
            cast: { count: 2 },
            blocking: {
              endFormation: "line",
              durationSeconds: 4,
              durationBeats: 8,
            },
          },
        })
      )
    ).toThrow(/exactly one of/i);
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({
          camera: {
            shotSize: "medium",
            moves: [{ move: "push-in", durationSeconds: 4, durationBeats: 8 }],
          },
        })
      )
    ).toThrow(/exactly one of/i);
  });

  it("accepts atBeats on a camera keyframe and demands exactly one time unit", () => {
    const parsed = FilmDirectorInputSchema.parse(
      beatsFilm({
        camera: {
          keyframes: [
            { atSeconds: 0, position: [0, 1, -4] },
            { atBeats: 8, position: [0, 1, -2] },
          ],
        },
      })
    );
    expect(parsed.scenes[0]!.camera?.keyframes?.[1]?.atBeats).toBe(8);
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({
          camera: {
            keyframes: [{ atSeconds: 1, atBeats: 8, position: [0, 1, -4] }],
          },
        })
      )
    ).toThrow(/exactly one of/i);
    expect(() =>
      FilmDirectorInputSchema.parse(
        beatsFilm({ camera: { keyframes: [{ position: [0, 1, -4] }] } })
      )
    ).toThrow(/exactly one of/i);
  });
});

describe("camera tracking grammar", () => {
  const trackingFilm = (camera: Record<string, unknown>) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "tracking-film",
    title: "Tracking",
    scenes: [{ id: "s1", title: "S1", camera }],
  });

  it("accepts track on a framing subject", () => {
    const parsed = FilmDirectorInputSchema.parse(
      trackingFilm({
        subject: {
          kind: "performer",
          performerId: "performer-1",
          track: "follow",
        },
        shotSize: "medium",
      })
    );
    expect(parsed.scenes[0]!.camera?.subject).toMatchObject({
      track: "follow",
    });
  });

  it("accepts the aim spelling but no other string", () => {
    expect(
      FilmDirectorInputSchema.parse(
        trackingFilm({
          subject: { kind: "performer", performerId: "performer-1", track: true },
          shotSize: "medium",
        })
      ).scenes[0]!.camera?.subject
    ).toMatchObject({ track: true });

    expect(() =>
      FilmDirectorInputSchema.parse(
        trackingFilm({
          subject: {
            kind: "performer",
            performerId: "performer-1",
            track: "aim",
          },
          shotSize: "medium",
        })
      )
    ).toThrow();
  });

  it("rejects track on a preset's target", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        trackingFilm({
          preset: "group-orbit",
          target: {
            kind: "performer",
            performerId: "performer-1",
            track: true,
          },
        })
      )
    ).toThrow(/spoken on \\"subject\\"/);
  });

  it("rejects track on a raw keyframe target", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        trackingFilm({
          keyframes: [
            {
              atSeconds: 0,
              position: [0, 1, -4],
              target: {
                kind: "performer",
                performerId: "performer-1",
                track: "follow",
              },
            },
          ],
        })
      )
    ).toThrow(/spoken on \\"subject\\"/);
  });
});

describe("camera shots grammar", () => {
  const shotsFilm = (camera: Record<string, unknown>) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "shots-film",
    title: "Shots",
    scenes: [{ id: "s1", title: "S1", camera }],
  });

  const twoShots = [
    { subject: { kind: "group" }, shotSize: "wide", durationBeats: 8 },
    { subject: { kind: "group" }, shotSize: "medium" },
  ];

  it("accepts two shots", () => {
    const parsed = FilmDirectorInputSchema.parse(shotsFilm({ shots: twoShots }));
    expect(parsed.scenes[0]!.camera?.shots).toHaveLength(2);
    expect(parsed.scenes[0]!.camera?.shots?.[0]?.durationBeats).toBe(8);
  });

  it("rejects a single shot and says why", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(shotsFilm({ shots: [twoShots[0]] }))
    ).toThrow(/at least two/);
  });

  it("rejects shots alongside a top-level framing", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        shotsFilm({ shots: twoShots, shotSize: "close-up" })
      )
    ).toThrow(/exclusive/);
  });

  it("rejects shots alongside a preset", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        shotsFilm({ shots: twoShots, preset: "group-orbit" })
      )
    ).toThrow(/exclusive/);
  });

  it("rejects shots alongside raw keyframes", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        shotsFilm({
          shots: twoShots,
          keyframes: [{ atSeconds: 0, position: [0, 1, -4] }],
        })
      )
    ).toThrow(/exclusive/);
  });

  it("rejects shots alongside a target", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        shotsFilm({ shots: twoShots, target: { kind: "group" } })
      )
    ).toThrow(/not \\"target\\"/);
  });

  it("rejects a shot stating both time units", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        shotsFilm({
          shots: [
            {
              subject: { kind: "group" },
              durationSeconds: 2,
              durationBeats: 4,
            },
            { subject: { kind: "group" } },
          ],
        })
      )
    ).toThrow(/exactly one of/i);
  });

  it("rejects tracking inside a shot", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        shotsFilm({
          shots: [
            {
              subject: {
                kind: "performer",
                performerId: "performer-1",
                track: "follow",
              },
              shotSize: "medium",
            },
            { subject: { kind: "group" } },
          ],
        })
      )
    ).toThrow(/Tracking and shots do not combine/);
  });
});

describe("sequence sources: transformOf and library", () => {
  function parse(performers: Record<string, unknown>[]) {
    return resolveFilmDirectorSpec({
      version: 2,
      id: "source-film",
      title: "Source Film",
      scenes: [{ id: "s1", title: "S1", performance: { performers } }],
    });
  }
  const sequences = (performers: Record<string, unknown>[]) =>
    parse(performers).scenes[0]!.performance.performers.map((p) => p.sequence);

  it("accepts a transform chain", () => {
    expect(
      sequences([
        { id: "lead", sequence: { word: "SAILOR" } },
        {
          id: "second",
          sequence: {
            transformOf: "lead",
            transforms: [
              { op: "rotate", degrees: 90, direction: "cw" },
              { op: "swap-hands" },
              { op: "start-at", step: 2 },
            ],
          },
        },
      ])[1]
    ).toEqual({
      transformOf: "lead",
      transforms: [
        { op: "rotate", degrees: 90, direction: "cw" },
        { op: "swap-hands" },
        { op: "start-at", step: 2 },
      ],
    });
  });

  it("accepts a library sequence", () => {
    expect(
      sequences([
        {
          id: "solo",
          sequence: { library: "0c7e6529-1dca-4254-903e-7068e38c030c" },
        },
      ])[0]
    ).toEqual({ library: "0c7e6529-1dca-4254-903e-7068e38c030c" });
  });

  it("rejects transformOf without transforms", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB" } },
        { id: "b", sequence: { transformOf: "a" } },
      ])
    ).toThrow(/transforms.{0,3} says what changes/);
  });

  it("rejects transforms without transformOf", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB", transforms: [{ op: "mirror" }] } },
      ])
    ).toThrow(/transforms.{0,3} only means something on a/);
  });

  it("rejects an empty transform chain", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB" } },
        { id: "b", sequence: { transformOf: "a", transforms: [] } },
      ])
    ).toThrow(/at least one/);
  });

  it("rejects a rotation that is not a 45-degree step", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB" } },
        {
          id: "b",
          sequence: {
            transformOf: "a",
            transforms: [{ op: "rotate", degrees: 60, direction: "cw" }],
          },
        },
      ])
    ).toThrow(/45/);
  });

  it("rejects a hand on swap-hands", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB" } },
        {
          id: "b",
          sequence: {
            transformOf: "a",
            transforms: [{ op: "swap-hands", hand: "left" }],
          },
        },
      ])
    ).toThrow();
  });

  it("rejects start-at step 1", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB" } },
        {
          id: "b",
          sequence: {
            transformOf: "a",
            transforms: [{ op: "start-at", step: 1 }],
          },
        },
      ])
    ).toThrow(/already starts/);
  });

  it("rejects controls on a library sequence", () => {
    expect(() =>
      parse([{ id: "a", sequence: { library: "x", level: 2 } }])
    ).toThrow(/already finished/);
  });

  it("rejects controls on a transformed sequence", () => {
    expect(() =>
      parse([
        { id: "a", sequence: { word: "AB" } },
        {
          id: "b",
          sequence: {
            transformOf: "a",
            transforms: [{ op: "flip" }],
            level: 2,
          },
        },
      ])
    ).toThrow(/carries no controls of its own/);
  });

  it("rejects two sources", () => {
    expect(() =>
      parse([{ id: "a", sequence: { library: "x", mirrorOf: "b" } }])
    ).toThrow(/names one source, but this one names .*mirrorOf.*library/);
  });
});

describe("per-performer effect config (spoken but not real)", () => {
  function filmWithPerformers(performers: Record<string, unknown>[]) {
    return {
      version: 2,
      id: "effect-config-film",
      title: "Effect Config Film",
      scenes: [{ id: "s1", title: "S1", performance: { performers } }],
    };
  }

  function filmWithCastDefaults(defaults: Record<string, unknown>) {
    return {
      version: 2,
      id: "effect-config-film",
      title: "Effect Config Film",
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: { cast: { count: 1, defaults } },
        },
      ],
    };
  }

  function filmWithScene(sceneExtra: Record<string, unknown>) {
    return {
      version: 2,
      id: "effect-config-film",
      title: "Effect Config Film",
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: { performers: [{ id: "performer-1" }] },
          ...sceneExtra,
        },
      ],
    };
  }

  it("rejects effectPresets on a performer with the scene-wide constraint", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        filmWithPerformers([
          {
            id: "performer-1",
            effect: "trails",
            effectPresets: { trails: "comet" },
          },
        ])
      )
    ).toThrow(/Effect presets and overrides are scene-wide/);
  });

  it("rejects effectOverrides on a performer with the same message", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        filmWithPerformers([
          {
            id: "performer-1",
            effect: "trails",
            effectOverrides: { trails: { length: 2 } },
          },
        ])
      )
    ).toThrow(/Effect presets and overrides are scene-wide/);
  });

  it("rejects effectPresets in cast defaults with the same message", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        filmWithCastDefaults({ effectPresets: { trails: "comet" } })
      )
    ).toThrow(/Effect presets and overrides are scene-wide/);
  });

  it("still accepts scene-scoped effectPresets", () => {
    const parsed = FilmDirectorInputSchema.parse(
      filmWithScene({ effectPresets: { trails: "trail-neon" } })
    );
    expect(parsed.scenes[0]!.effectPresets).toEqual({ trails: "trail-neon" });
  });
});

describe("blocking edges", () => {
  const edgesFilm = (blocking: unknown[]) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "edges-film",
    title: "Edges",
    scenes: [
      {
        id: "s1",
        title: "S1",
        performance: { performers: [{ id: "a", blocking }] },
      },
    ],
  });
  const parseBlocking = (blocking: unknown[]) =>
    FilmDirectorInputSchema.parse(edgesFilm(blocking));

  it("parses a run move so the compiler can reject it by name", () => {
    const parsed = parseBlocking([{ move: "run", to: { x: 0, z: 2 } }]);
    expect(
      parsed.scenes[0]!.performance!.performers![0]!.blocking![0]!.move
    ).toBe("run");
  });
  it("accepts an arc on a walk", () => {
    const parsed = parseBlocking([
      { move: "walk", to: { x: 2, z: 0 }, along: { arc: "left", bulge: 0.25 } },
    ]);
    expect(
      parsed.scenes[0]!.performance!.performers![0]!.blocking![0]!.along
    ).toEqual({ arc: "left", bulge: 0.25 });
  });

  it("rejects a bulge outside its bounds", () => {
    for (const bulge of [0, -0.5, 1.6]) {
      expect(() =>
        parseBlocking([
          { move: "walk", to: { x: 2, z: 0 }, along: { arc: "left", bulge } },
        ])
      ).toThrow();
    }
  });

  it("rejects an unknown arc side", () => {
    expect(() =>
      parseBlocking([
        { move: "walk", to: { x: 2, z: 0 }, along: { arc: "wide" } },
      ])
    ).toThrow();
  });
});

describe("standing and watching", () => {
  const watcherFilm = (sequence: unknown) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "watcher-film",
    title: "Watcher",
    scenes: [
      {
        id: "s1",
        title: "S1",
        performance: { performers: [{ id: "a", sequence }] },
      },
    ],
  });

  it("accepts a performer who stands and watches", () => {
    const parsed = FilmDirectorInputSchema.parse(
      watcherFilm({ source: "none" })
    );
    expect(parsed.scenes[0]!.performance!.performers![0]!.sequence).toEqual({
      source: "none",
    });
  });

  it("rejects controls on a performer who is not spinning", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(watcherFilm({ source: "none", level: 2 }))
    ).toThrow(/is not spinning anything/);
  });
});

describe("per-step changes: stepEffects, stepEfforts, holds", () => {
  // This file has no shared film/parse helper — the stepPlanes parse tests
  // build a whole document inline each time. These wrap that same shape once.
  const film = (scene: Record<string, unknown>) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "per-step",
    title: "Per step",
    scenes: [{ id: "s1", title: "S1", ...scene }],
  });
  const parse = (doc: unknown) => FilmDirectorInputSchema.parse(doc);

  it("accepts a step effect list, a step effort list, and holds", () => {
    const parsed = parse(
      film({
        performance: {
          cast: {
            count: 2,
            performers: [
              {
                id: "performer-1",
                stepEffects: [
                  { step: 0, effect: "none" },
                  { step: 4, effect: "trails" },
                ],
                stepEfforts: [{ step: 8, effort: "punch" }],
              },
              { id: "performer-2", holds: [{ fromStep: 4, steps: 4 }] },
            ],
          },
        },
      })
    );
    const cast = parsed.scenes[0]!.performance!.cast!.performers!;
    expect(cast[0]!.stepEffects).toEqual([
      { step: 0, effect: "none" },
      { step: 4, effect: "trails" },
    ]);
    expect(cast[0]!.stepEfforts).toEqual([{ step: 8, effort: "punch" }]);
    expect(cast[1]!.holds).toEqual([{ fromStep: 4, steps: 4 }]);
  });

  it("accepts the same three lists on cast defaults", () => {
    const parsed = parse(
      film({
        performance: {
          cast: {
            count: 2,
            defaults: {
              stepEffects: [{ step: 2, effect: { pick: "any", not: ["fire"] } }],
              stepEfforts: [{ step: 2, effort: { oneOf: ["punch", "dab"] } }],
              holds: [{ fromStep: 0, steps: 2 }],
            },
          },
        },
      })
    );
    expect(parsed.scenes[0]!.performance!.cast!.defaults!.holds).toEqual([
      { fromStep: 0, steps: 2 },
    ]);
  });

  it("rejects an unknown effect on a step entry", () => {
    expect(() =>
      parse(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [
                { id: "a", stepEffects: [{ step: 0, effect: "glitter" }] },
              ],
            },
          },
        })
      )
    ).toThrow(/Unknown effect .{0,2}glitter/);
  });

  it("rejects an unknown effort on a step entry", () => {
    expect(() =>
      parse(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [
                { id: "a", stepEfforts: [{ step: 0, effort: "swagger" }] },
              ],
            },
          },
        })
      )
    ).toThrow(/Unknown effort .{0,2}swagger/);
  });

  it("rejects a negative step and a fractional step", () => {
    for (const step of [-1, 1.5]) {
      expect(() =>
        parse(
          film({
            performance: {
              cast: {
                count: 1,
                performers: [
                  { id: "a", stepEffects: [{ step, effect: "trails" }] },
                ],
              },
            },
          })
        )
      ).toThrow();
    }
  });

  it("rejects a hold of zero steps and a negative fromStep", () => {
    expect(() =>
      parse(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [{ id: "a", holds: [{ fromStep: 0, steps: 0 }] }],
            },
          },
        })
      )
    ).toThrow(/at least one step/);
    expect(() =>
      parse(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [{ id: "a", holds: [{ fromStep: -1, steps: 2 }] }],
            },
          },
        })
      )
    ).toThrow();
  });

  it("rejects an unknown key inside a hold", () => {
    expect(() =>
      parse(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [
                { id: "a", holds: [{ fromStep: 0, steps: 2, beats: 4 }] },
              ],
            },
          },
        })
      )
    ).toThrow();
  });
});

describe("camera: concurrent moves, handheld, pan destinations", () => {
  const film = (camera: Record<string, unknown>) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "wave-a",
    title: "Wave A",
    scenes: [{ id: "s1", title: "S1", camera }],
  });
  const parse = (doc: unknown) => FilmDirectorInputSchema.parse(doc);
  const moves = (list: unknown) => film({ shotSize: "medium", moves: list });

  it("accepts a dolly zoom, a crane riding a truck, and a pan to a performer", () => {
    expect(() =>
      parse(
        moves([
          {
            move: "push-in",
            amount: { meters: 1 },
            durationSeconds: 4,
            with: [{ move: "zoom", amount: { match: "subject-size" } }],
          },
          {
            move: "truck",
            direction: "right",
            amount: { meters: 1 },
            with: [{ move: "crane", direction: "up", amount: { meters: 0.5 } }],
          },
          { move: "pan", to: { kind: "performer", performerId: "performer-2" } },
          { move: "pan", to: { kind: "point", position: [1, 1, 1] } },
        ])
      )
    ).not.toThrow();
  });

  it("accepts handheld as a preset and as a stated envelope", () => {
    expect(() => parse(film({ shotSize: "wide", handheld: "rough" }))).not.toThrow();
    expect(() =>
      parse(film({ shotSize: "wide", handheld: { meters: 0.04, degrees: 0.8 } }))
    ).not.toThrow();
  });

  it("rejects a handheld envelope past what an operator could hold", () => {
    expect(() =>
      parse(film({ shotSize: "wide", handheld: { meters: 1, degrees: 0.8 } }))
    ).toThrow();
    expect(() =>
      parse(film({ shotSize: "wide", handheld: { meters: 0.04, degrees: 20 } }))
    ).toThrow();
    expect(() => parse(film({ shotSize: "wide", handheld: "violent" }))).toThrow();
  });

  it("rejects a group inside a group", () => {
    expect(() =>
      parse(
        moves([
          {
            move: "push-in",
            amount: { meters: 1 },
            with: [{ move: "truck", direction: "right", with: [{ move: "roll" }] }],
          },
        ])
      )
    ).toThrow(/already runs alongside/);
  });

  it("rejects a member that states its own duration", () => {
    expect(() =>
      parse(
        moves([
          {
            move: "push-in",
            amount: { meters: 1 },
            durationSeconds: 4,
            with: [{ move: "crane", direction: "up", amount: { meters: 1 }, durationSeconds: 2 }],
          },
        ])
      )
    ).toThrow(/shares the window/);
  });

  it("rejects a hold on either side of a group", () => {
    expect(() =>
      parse(moves([{ move: "hold", with: [{ move: "roll", amount: { degrees: 5 } }] }]))
    ).toThrow(/hold/);
    expect(() =>
      parse(moves([{ move: "push-in", amount: { meters: 1 }, with: [{ move: "hold" }] }]))
    ).toThrow(/hold/);
  });

  it("rejects a subject-size match anywhere it cannot be answered", () => {
    // On the move itself rather than on a zoom riding with it.
    expect(() =>
      parse(moves([{ move: "push-in", amount: { match: "subject-size" } }]))
    ).toThrow();
    // On a member that is not a zoom.
    expect(() =>
      parse(
        moves([
          {
            move: "push-in",
            amount: { meters: 1 },
            with: [{ move: "truck", direction: "right", amount: { match: "subject-size" } }],
          },
        ])
      )
    ).toThrow();
    // On a zoom whose parent does not travel toward or away from the subject.
    expect(() =>
      parse(
        moves([
          {
            move: "truck",
            direction: "right",
            amount: { meters: 1 },
            with: [{ move: "zoom", amount: { match: "subject-size" } }],
          },
        ])
      )
    ).toThrow();
    // On a zoom that also states a direction.
    expect(() =>
      parse(
        moves([
          {
            move: "push-in",
            amount: { meters: 1 },
            with: [{ move: "zoom", direction: "in", amount: { match: "subject-size" } }],
          },
        ])
      )
    ).toThrow();
  });

  it("rejects a pan that states both a destination and an angle", () => {
    expect(() =>
      parse(
        moves([
          {
            move: "pan",
            direction: "left",
            to: { kind: "performer", performerId: "performer-2" },
          },
        ])
      )
    ).toThrow();
    expect(() =>
      parse(
        moves([
          {
            move: "pan",
            amount: { degrees: 30 },
            to: { kind: "performer", performerId: "performer-2" },
          },
        ])
      )
    ).toThrow();
  });

  it("rejects a destination on a move that is not a pan", () => {
    expect(() =>
      parse(
        moves([
          {
            move: "orbit",
            direction: "cw",
            to: { kind: "performer", performerId: "performer-2" },
          },
        ])
      )
    ).toThrow();
  });
});

/**
 * Gap 22. Bars sit beside beats everywhere beats are accepted, and the
 * contradiction rule counts all three units rather than two.
 */
describe("bars as a time unit", () => {
  const barsFilm = (scene: Record<string, unknown>) => ({
    version: FILM_DIRECTOR_SCHEMA_VERSION_5,
    id: "bars-film",
    title: "Bars",
    scenes: [{ id: "s1", title: "S1", ...scene }],
  });

  it("accepts a meter between two and twelve and rejects outside it", () => {
    const parsed = FilmDirectorInputSchema.parse(
      barsFilm({ performance: { meter: { beatsPerBar: 3 } } })
    );
    expect(parsed.scenes[0]!.performance!.meter!.beatsPerBar).toBe(3);
    for (const beatsPerBar of [1, 13, 3.5]) {
      expect(() =>
        FilmDirectorInputSchema.parse(
          barsFilm({ performance: { meter: { beatsPerBar } } })
        )
      ).toThrow();
    }
  });

  it("rejects bars stated alongside beats or seconds on one field", () => {
    expect(() =>
      FilmDirectorInputSchema.parse(
        barsFilm({ durationBars: 4, durationBeats: 12 })
      )
    ).toThrow(/exactly one of/i);
    expect(() =>
      FilmDirectorInputSchema.parse(
        barsFilm({ durationBars: 4, durationSeconds: 8 })
      )
    ).toThrow(/exactly one of/i);
  });

  it("takes atBars on a camera keyframe, still exactly one unit", () => {
    const keyframes = (list: unknown[]) =>
      barsFilm({ durationSeconds: 8, camera: { keyframes: list } });
    expect(() =>
      FilmDirectorInputSchema.parse(
        keyframes([{ atBars: 0, position: [0, 1, -4] }])
      )
    ).not.toThrow();
    expect(() =>
      FilmDirectorInputSchema.parse(
        keyframes([{ atBars: 0, atBeats: 0, position: [0, 1, -4] }])
      )
    ).toThrow(/exactly one of/i);
    expect(() =>
      FilmDirectorInputSchema.parse(keyframes([{ position: [0, 1, -4] }]))
    ).toThrow(/exactly one of/i);
  });

  it("rejects a duration on a move inside a with group, in any unit", () => {
    const withGroup = (member: Record<string, unknown>) =>
      barsFilm({
        durationSeconds: 8,
        camera: {
          shotSize: "medium",
          moves: [
            {
              move: "push-in",
              amount: { meters: 1 },
              durationSeconds: 4,
              with: [{ move: "zoom", amount: { degrees: 10 }, ...member }],
            },
          ],
        },
      });
    expect(() => FilmDirectorInputSchema.parse(withGroup({}))).not.toThrow();
    expect(() =>
      FilmDirectorInputSchema.parse(withGroup({ durationBars: 1 }))
    ).toThrow(/shares the window/);
  });
});
