import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PropPreferences, CatdogCombo } from "./types";
import { normalizeLegacyPropConfig } from "@tka/tka-types";

const DEFAULT_PREFS: PropPreferences = {
  propsISpinWith: [],
  favoriteProp: null,
  favoriteCatdog: null,
};

function validatePrefs(prefs: PropPreferences): void {
  if (
    prefs.favoriteProp &&
    !prefs.propsISpinWith.includes(prefs.favoriteProp)
  ) {
    throw new Error(
      `favoriteProp "${prefs.favoriteProp}" must be in propsISpinWith`
    );
  }
  if (prefs.favoriteCatdog) {
    if (!prefs.propsISpinWith.includes(prefs.favoriteCatdog.leftPropType)) {
      throw new Error(
        `catdog blue "${prefs.favoriteCatdog.leftPropType}" must be in propsISpinWith`
      );
    }
    if (!prefs.propsISpinWith.includes(prefs.favoriteCatdog.rightPropType)) {
      throw new Error(
        `catdog red "${prefs.favoriteCatdog.rightPropType}" must be in propsISpinWith`
      );
    }
  }
}

export async function loadPropPreferences(
  userId: string
): Promise<PropPreferences> {
  const db = await getFirestoreInstance();
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return { ...DEFAULT_PREFS };
  const data = userDoc.data();
  return {
    propsISpinWith: (data.propsISpinWith as PropType[]) ?? [],
    favoriteProp: (data.favoriteProp as PropType) ?? null,
    favoriteCatdog: data.favoriteCatdog
      ? (normalizeLegacyPropConfig(data.favoriteCatdog) as CatdogCombo)
      : null,
  };
}

export async function savePropPreferences(
  userId: string,
  prefs: PropPreferences
): Promise<void> {
  validatePrefs(prefs);
  const db = await getFirestoreInstance();
  await updateDoc(doc(db, "users", userId), {
    propsISpinWith: prefs.propsISpinWith,
    favoriteProp: prefs.favoriteProp,
    favoriteCatdog: prefs.favoriteCatdog,
  });
}

export async function addPropPreference(
  userId: string,
  prop: PropType
): Promise<void> {
  const prefs = await loadPropPreferences(userId);
  if (prefs.propsISpinWith.includes(prop)) return;
  prefs.propsISpinWith.push(prop);
  await savePropPreferences(userId, prefs);
}

export async function removePropPreference(
  userId: string,
  prop: PropType
): Promise<void> {
  const prefs = await loadPropPreferences(userId);
  prefs.propsISpinWith = prefs.propsISpinWith.filter((p) => p !== prop);
  if (prefs.favoriteProp === prop) prefs.favoriteProp = null;
  if (
    prefs.favoriteCatdog &&
    (prefs.favoriteCatdog.leftPropType === prop ||
      prefs.favoriteCatdog.rightPropType === prop)
  ) {
    prefs.favoriteCatdog = null;
  }
  await savePropPreferences(userId, prefs);
}

export async function setFavoriteProp(
  userId: string,
  prop: PropType | null
): Promise<void> {
  const prefs = await loadPropPreferences(userId);
  if (prop && !prefs.propsISpinWith.includes(prop))
    prefs.propsISpinWith.push(prop);
  prefs.favoriteProp = prop;
  await savePropPreferences(userId, prefs);
}

export async function setCatdogFavorite(
  userId: string,
  combo: CatdogCombo | null
): Promise<void> {
  const prefs = await loadPropPreferences(userId);
  if (combo) {
    if (!prefs.propsISpinWith.includes(combo.leftPropType))
      prefs.propsISpinWith.push(combo.leftPropType);
    if (!prefs.propsISpinWith.includes(combo.rightPropType))
      prefs.propsISpinWith.push(combo.rightPropType);
  }
  prefs.favoriteCatdog = combo;
  await savePropPreferences(userId, prefs);
}
