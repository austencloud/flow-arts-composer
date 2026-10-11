/**
 * PropPreferencePersister Constraint Tests
 *
 * The validate() and removeProp() logic enforces that favoriteProp
 * must be in propsISpinWith, and removing a prop cascades to clear
 * favorites. A bug here silently saves invalid state to Firestore
 * that causes crashes or wrong rendering downstream.
 *
 * We test the constraint logic by calling save() directly with
 * crafted PropPreferences objects. The Firestore calls are mocked
 * since we're testing the validation rules, not the database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore and auth/firebase before importing the class
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

import {
  loadPropPreferences,
  savePropPreferences,
  removePropPreference,
  setFavoriteProp,
} from "../../../src/lib/shared/community/services/prop-preference-persister";
import { PropType } from "../../../src/lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PropPreferences } from "../../../src/lib/shared/community/services/contracts/types";
import { updateDoc, getDoc } from "firebase/firestore";

describe("PropPreferencePersister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateDoc).mockResolvedValue(undefined);
  });

  it("restores a literal blue/red CatDog favorite", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        propsISpinWith: [PropType.POI, PropType.FAN],
        favoriteProp: null,
        favoriteCatdog: {
          bluePropType: PropType.POI,
          redPropType: PropType.FAN,
        },
      }),
    } as never);

    await expect(loadPropPreferences("legacy-user")).resolves.toMatchObject({
      favoriteCatdog: {
        leftPropType: PropType.POI,
        rightPropType: PropType.FAN,
      },
    });
  });

  describe("validate (via save)", () => {
    it("throws when favoriteProp is not in propsISpinWith", async () => {
      const prefs: PropPreferences = {
        propsISpinWith: [PropType.STAFF],
        favoriteProp: PropType.FAN, // not in the list
        favoriteCatdog: null,
      };

      await expect(savePropPreferences("user1", prefs)).rejects.toThrow(
        'favoriteProp "fan" must be in propsISpinWith'
      );
    });

    it("throws when catdog blue prop is not in propsISpinWith", async () => {
      const prefs: PropPreferences = {
        propsISpinWith: [PropType.STAFF],
        favoriteProp: null,
        favoriteCatdog: {
          leftPropType: PropType.FAN, // not in list
          rightPropType: PropType.STAFF,
        },
      };

      await expect(savePropPreferences("user1", prefs)).rejects.toThrow(
        'catdog blue "fan" must be in propsISpinWith'
      );
    });

    it("throws when catdog red prop is not in propsISpinWith", async () => {
      const prefs: PropPreferences = {
        propsISpinWith: [PropType.FAN],
        favoriteProp: null,
        favoriteCatdog: {
          leftPropType: PropType.FAN,
          rightPropType: PropType.STAFF, // not in list
        },
      };

      await expect(savePropPreferences("user1", prefs)).rejects.toThrow(
        'catdog red "staff" must be in propsISpinWith'
      );
    });

    it("succeeds when favoriteProp is in propsISpinWith", async () => {
      const prefs: PropPreferences = {
        propsISpinWith: [PropType.STAFF, PropType.FAN],
        favoriteProp: PropType.STAFF,
        favoriteCatdog: null,
      };

      await expect(savePropPreferences("user1", prefs)).resolves.not.toThrow();
    });

    it("succeeds when both catdog props are in propsISpinWith", async () => {
      const prefs: PropPreferences = {
        propsISpinWith: [PropType.STAFF, PropType.FAN],
        favoriteProp: null,
        favoriteCatdog: {
          leftPropType: PropType.STAFF,
          rightPropType: PropType.FAN,
        },
      };

      await expect(savePropPreferences("user1", prefs)).resolves.not.toThrow();
    });
  });

  describe("removeProp cascade logic", () => {
    function mockLoadReturning(prefs: PropPreferences) {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          propsISpinWith: prefs.propsISpinWith,
          favoriteProp: prefs.favoriteProp,
          favoriteCatdog: prefs.favoriteCatdog,
        }),
      } as any);
    }

    it("clears favoriteProp when removing the favorite prop", async () => {
      mockLoadReturning({
        propsISpinWith: [PropType.STAFF, PropType.FAN],
        favoriteProp: PropType.STAFF,
        favoriteCatdog: null,
      });

      await removePropPreference("user1", PropType.STAFF);

      const savedPrefs = vi.mocked(updateDoc).mock.calls[0][1] as any;
      expect(savedPrefs.propsISpinWith).toEqual([PropType.FAN]);
      expect(savedPrefs.favoriteProp).toBeNull();
    });

    it("clears favoriteCatdog when removing the blue catdog prop", async () => {
      mockLoadReturning({
        propsISpinWith: [PropType.STAFF, PropType.FAN, PropType.CLUB],
        favoriteProp: PropType.CLUB,
        favoriteCatdog: {
          leftPropType: PropType.STAFF,
          rightPropType: PropType.FAN,
        },
      });

      await removePropPreference("user1", PropType.STAFF);

      const savedPrefs = vi.mocked(updateDoc).mock.calls[0][1] as any;
      expect(savedPrefs.propsISpinWith).toEqual([PropType.FAN, PropType.CLUB]);
      expect(savedPrefs.favoriteCatdog).toBeNull();
      // favoriteProp should remain since we didn't remove CLUB
      expect(savedPrefs.favoriteProp).toBe(PropType.CLUB);
    });

    it("clears favoriteCatdog when removing the red catdog prop", async () => {
      mockLoadReturning({
        propsISpinWith: [PropType.STAFF, PropType.FAN],
        favoriteProp: null,
        favoriteCatdog: {
          leftPropType: PropType.STAFF,
          rightPropType: PropType.FAN,
        },
      });

      await removePropPreference("user1", PropType.FAN);

      const savedPrefs = vi.mocked(updateDoc).mock.calls[0][1] as any;
      expect(savedPrefs.favoriteCatdog).toBeNull();
    });

    it("does not clear favoriteProp when removing a non-favorite prop", async () => {
      mockLoadReturning({
        propsISpinWith: [PropType.STAFF, PropType.FAN],
        favoriteProp: PropType.STAFF,
        favoriteCatdog: null,
      });

      await removePropPreference("user1", PropType.FAN);

      const savedPrefs = vi.mocked(updateDoc).mock.calls[0][1] as any;
      expect(savedPrefs.favoriteProp).toBe(PropType.STAFF);
      expect(savedPrefs.propsISpinWith).toEqual([PropType.STAFF]);
    });
  });

  describe("Profile prop", () => {
    it("allows an explicit Profile prop to be cleared", async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          propsISpinWith: [PropType.STAFF, PropType.FAN],
          favoriteProp: PropType.STAFF,
          favoriteCatdog: null,
        }),
      } as any);

      await setFavoriteProp("user1", null);

      const savedPrefs = vi.mocked(updateDoc).mock.calls[0][1] as any;
      expect(savedPrefs.propsISpinWith).toEqual([PropType.STAFF, PropType.FAN]);
      expect(savedPrefs.favoriteProp).toBeNull();
    });
  });
});
