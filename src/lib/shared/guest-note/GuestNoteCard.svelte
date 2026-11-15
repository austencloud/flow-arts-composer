<!--
  GuestNoteCard.svelte

  The one-time note for a guest who comes back on a later day: a short,
  friendly invitation from Austen to make a free account. Same spot and look
  as the install card (BottomNoteCard), never blocking, gone for good after
  Not now, the close button or Escape. Any of those, and Create account, also
  start the app's one-day "not now".

  guestNote (guest-note-state.svelte.ts) owns when it shows and the events.
-->
<script lang="ts">
  import BottomNoteCard from "#lib/shared/components/BottomNoteCard.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { GUEST_SAVE_CAP } from "#lib/shared/auth/domain/guest-access-config.js";
  import { guestNote } from "./guest-note-state.svelte";

  const body = $derived(t("guest_note_body", { count: GUEST_SAVE_CAP }));

  // Counts today as a visit day once the page is up.
  onMount(() => guestNote.init());
</script>

<BottomNoteCard
  open={guestNote.open}
  class="guest-note"
  titleId="guest-note-title"
  title={t("guest_note_title")}
  announce={`${t("guest_note_title")}. ${body}`}
  closeLabel={t("action_close")}
  onClose={() => guestNote.close("close")}
  onEscape={() => guestNote.close("escape")}
  secondaryLabel={t("action_not_now")}
  onSecondary={() => guestNote.close("not_now")}
  primaryLabel={t("auth_nudge_create_account")}
  onPrimary={() => guestNote.makeAccount()}
>
  {#snippet leading()}
    <img
      class="face"
      src="/images/austen-avatar-96.webp"
      alt=""
      width="40"
      height="40"
    />
  {/snippet}

  <p class="card-text">{body}</p>
  <p class="signature">{t("guest_note_signature")}</p>
</BottomNoteCard>

<style>
  .face {
    width: 40px;
    height: 40px;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    flex-shrink: 0;
    object-fit: cover;
  }

  .signature {
    margin: -4px 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }
</style>
