import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  loadPropPreferences,
  savePropPreferences,
} from "../services/prop-preference-persister";
import type { CatdogCombo, PropPreferences } from "../services/types";

function clonePreferences(prefs: PropPreferences): PropPreferences {
  return {
    propsISpinWith: [...prefs.propsISpinWith],
    favoriteProp: prefs.favoriteProp,
    favoriteCatdog: prefs.favoriteCatdog ? { ...prefs.favoriteCatdog } : null,
  };
}

function uniqueProps(props: readonly PropType[]): PropType[] {
  return props.filter((prop, index) => props.indexOf(prop) === index);
}

function catdogStillSelected(
  combo: CatdogCombo | null,
  props: readonly PropType[]
): CatdogCombo | null {
  if (!combo) return null;
  return props.includes(combo.leftPropType) && props.includes(combo.rightPropType)
    ? combo
    : null;
}

export function createPropPreferenceState(userId: string) {
  let propsISpinWith = $state<PropType[]>([]);
  let favoriteProp = $state<PropType | null>(null);
  let favoriteCatdog = $state<CatdogCombo | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  let confirmedPreferences: PropPreferences = {
    propsISpinWith: [],
    favoriteProp: null,
    favoriteCatdog: null,
  };
  let writeQueue: Promise<void> = Promise.resolve();
  let pendingWrites = 0;
  let latestWriteId = 0;

  function applyPreferences(prefs: PropPreferences): void {
    propsISpinWith = [...prefs.propsISpinWith];
    favoriteProp = prefs.favoriteProp;
    favoriteCatdog = prefs.favoriteCatdog ? { ...prefs.favoriteCatdog } : null;
  }

  function currentPreferences(): PropPreferences {
    return {
      propsISpinWith: [...propsISpinWith],
      favoriteProp,
      favoriteCatdog: favoriteCatdog ? { ...favoriteCatdog } : null,
    };
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const prefs = clonePreferences(await loadPropPreferences(userId));
      confirmedPreferences = prefs;
      applyPreferences(prefs);
    } catch (loadError) {
      console.warn(
        "[propPreferenceState] Preferences could not be loaded",
        loadError
      );
      error = "Your prop preferences couldn't be loaded. Try again.";
    } finally {
      loading = false;
    }
  }

  /**
   * Writes complete snapshots in user-action order. A second submit can update
   * the UI immediately, but its Firestore write waits for the first one so an
   * older response can never overwrite a newer choice.
   */
  async function persistSnapshot(
    nextPreferences: PropPreferences,
    failureMessage: string
  ): Promise<void> {
    const optimistic = clonePreferences(nextPreferences);
    const writeId = ++latestWriteId;
    pendingWrites += 1;
    saving = true;
    error = null;
    applyPreferences(optimistic);

    const operation = writeQueue
      .catch(() => undefined)
      .then(() => savePropPreferences(userId, optimistic));
    writeQueue = operation;

    try {
      await operation;
      confirmedPreferences = clonePreferences(optimistic);
    } catch (saveError) {
      if (writeId === latestWriteId) {
        applyPreferences(confirmedPreferences);
        error = failureMessage;
      }
      throw saveError;
    } finally {
      pendingWrites -= 1;
      saving = pendingWrites > 0;
    }
  }

  async function saveProfileSelection(
    props: readonly PropType[],
    profileProp: PropType | null
  ): Promise<void> {
    const nextProps = uniqueProps(props);
    const nextFavorite =
      profileProp && nextProps.includes(profileProp) ? profileProp : null;
    await persistSnapshot(
      {
        propsISpinWith: nextProps,
        favoriteProp: nextFavorite,
        favoriteCatdog: catdogStillSelected(favoriteCatdog, nextProps),
      },
      "Your changes weren't saved. The editor kept your choices so you can retry."
    );
  }

  async function toggleProp(prop: PropType) {
    const nextProps = propsISpinWith.includes(prop)
      ? propsISpinWith.filter((selected) => selected !== prop)
      : [...propsISpinWith, prop];
    const nextFavorite = favoriteProp === prop ? null : favoriteProp;
    await saveProfileSelection(nextProps, nextFavorite);
  }

  async function setFavorite(prop: PropType | null) {
    const nextProps =
      prop && !propsISpinWith.includes(prop)
        ? [...propsISpinWith, prop]
        : propsISpinWith;
    await persistSnapshot(
      {
        ...currentPreferences(),
        propsISpinWith: nextProps,
        favoriteProp: prop,
      },
      "Your Profile prop couldn't be saved. Try again."
    );
  }

  async function setCatdogFavorite(combo: CatdogCombo | null) {
    const nextProps = [...propsISpinWith];
    if (combo) {
      if (!nextProps.includes(combo.leftPropType)) {
        nextProps.push(combo.leftPropType);
      }
      if (!nextProps.includes(combo.rightPropType)) {
        nextProps.push(combo.rightPropType);
      }
    }
    await persistSnapshot(
      {
        ...currentPreferences(),
        propsISpinWith: nextProps,
        favoriteCatdog: combo,
      },
      "That prop pairing couldn't be saved. Try again."
    );
  }

  function clearError() {
    error = null;
  }

  void load();

  return {
    get propsISpinWith() {
      return propsISpinWith;
    },
    get favoriteProp() {
      return favoriteProp;
    },
    get favoriteCatdog() {
      return favoriteCatdog;
    },
    get loading() {
      return loading;
    },
    get saving() {
      return saving;
    },
    get error() {
      return error;
    },
    toggleProp,
    saveProfileSelection,
    setFavorite,
    setCatdogFavorite,
    clearError,
    reload: load,
  };
}

export type PropPreferenceState = ReturnType<typeof createPropPreferenceState>;
