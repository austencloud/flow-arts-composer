<!--
  RetroDesktop - Root shell component for TKA-OS v1.0

  Composes the full Win95-style desktop experience:
  - Teal #008080 background filling the viewport
  - Desktop icons in a left-column grid (75px vertical spacing)
  - Recycle Bin pinned to bottom-right
  - Open windows rendered via RetroWindow primitive
  - Taskbar fixed at bottom with Start button, window buttons, clock
  - Start menu popup with program launchers and Shut Down
  - Boot sequence animation (RetroBootSequence)

  Domain: Retro Desktop Shell
-->
<script lang="ts">
  import "../../styles/98-scoped.css";
  import "../../styles/retro-tokens.css";
  import "../../styles/retro-overrides.css";

  import type {
    RetroDesktopIcon,
    RetroStartMenuItem,
    RetroContextMenuItem,
  } from "../../domain/types/retro-types";
  import type { RetroIconName } from "../rendering/retro-icons";
  import { desktopState } from "../../state/desktop-state.svelte";
  import { retroSound } from "../../state/retro-sound";
  import { WindowManager } from "../../services/window-manager";

  import RetroDesktopIconComponent from "./RetroDesktopIcon.svelte";
  import RetroTaskbar from "./RetroTaskbar.svelte";
  import RetroStartMenu from "./RetroStartMenu.svelte";
  import RetroWindow from "../primitives/RetroWindow.svelte";
  import RetroBootSequence from "./RetroBootSequence.svelte";
  import RetroScribe from "../apps/scribe/RetroScribe.svelte";
  import RetroFileManager from "../apps/filemgr/RetroFileManager.svelte";
  import RetroTutor from "../apps/tutor/RetroTutor.svelte";
  import RetroCards from "../apps/cards/RetroCards.svelte";
  import RetroControlPanel from "../apps/control/RetroControlPanel.svelte";
  import RetroUpgrade from "../apps/upgrade/RetroUpgrade.svelte";
  import RetroReadme from "./RetroReadme.svelte";
  import RetroHelp from "./RetroHelp.svelte";
  import RetroRecycleBin from "./RetroRecycleBin.svelte";
  import RetroBSOD from "../easter-eggs/RetroBSOD.svelte";
  import RetroDefrag from "../easter-eggs/RetroDefrag.svelte";
  import RetroScreensaver from "../easter-eggs/RetroScreensaver.svelte";
  import RetroClippy from "../easter-eggs/RetroClippy.svelte";
  import RetroDoom from "../apps/doom/RetroDoom.svelte";
  import RetroTaskManager from "../easter-eggs/RetroTaskManager.svelte";
  import CRTOverlay from "../effects/CRTOverlay.svelte";
  import RetroContextMenu from "./RetroContextMenu.svelte";
  import RetroMobileWarning from "./RetroMobileWarning.svelte";
  import RetroLoginDialog from "./RetroLoginDialog.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { loadRetroSettings } from "../../adapters/settings-adapter";

  /* Props                                                               */

  let {
    initialApp = undefined,
  }: {
    initialApp?: string;
  } = $props();

  /* Window manager instance                                             */

  const windowManager = new WindowManager();

  /* Desktop icons                                                       */

  const desktopIcons: RetroDesktopIcon[] = [
    { id: "mycomputer", label: "My Computer", icon: "mycomputer", executable: "mycomputer" },
    { id: "notation", label: "TKANOTTN.EXE", icon: "scribe", executable: "notation" },
    { id: "filemgr", label: "FILEMGR.EXE", icon: "filemgr", executable: "filemgr" },
    { id: "tutor", label: "TUTOR.EXE", icon: "tutor", executable: "tutor" },
    { id: "cards", label: "CARDS.EXE", icon: "cards", executable: "cards" },
    { id: "control", label: "CONTROL.EXE", icon: "control", executable: "control" },
    { id: "upgrade", label: "UPGRADE.EXE", icon: "upgrade", executable: "upgrade" },
    { id: "readme", label: "README.TXT", icon: "readme", executable: "readme" },
    { id: "help", label: "HELP.HLP", icon: "help", executable: "help" },
    { id: "defrag", label: "DEFRAG.EXE", icon: "defrag", executable: "defrag" },
  ];

  const recycleBin: RetroDesktopIcon = {
    id: "recyclebin",
    label: "Recycle Bin",
    icon: "recyclebin",
    executable: "recyclebin",
  };

  /* Start menu items                                                    */

  const startMenuItems: RetroStartMenuItem[] = [
    {
      label: "Programs",
      icon: "programs",
      children: [
        { label: "TKANOTTN.EXE", icon: "scribe", action: () => openApp("notation", "TKA Notation System", "scribe") },
        { label: "FILEMGR.EXE", icon: "filemgr", action: () => openApp("filemgr", "FILEMGR.EXE", "filemgr") },
        { label: "TUTOR.EXE", icon: "tutor", action: () => openApp("tutor", "TUTOR.EXE", "tutor") },
        { label: "CARDS.EXE", icon: "cards", action: () => openApp("cards", "CARDS.EXE", "cards") },
        { label: "DEFRAG.EXE", icon: "defrag", action: () => openApp("defrag", "DEFRAG.EXE", "defrag") },
        { label: "UPGRADE.EXE", icon: "upgrade", action: () => openApp("upgrade", "UPGRADE.EXE", "upgrade") },
      ],
    },
    { label: "Documents", icon: "documents", children: [] },
    {
      label: "Settings",
      icon: "control",
      children: [
        { label: "Control Panel", icon: "control", action: () => openApp("control", "Control Panel", "control") },
      ],
    },
    { label: "Find", icon: "find", children: [] },
    { label: "Help", icon: "help", action: () => openApp("help", "Help", "help") },
    { separator: true, label: "" },
    { label: "Shut Down...", icon: "shutdown", action: () => showShutdownDialog() },
  ];

  /* App launcher                                                        */

  let windowCounter = $state(0);
  let showBSOD = $state(false);
  let showScreensaver = $state(false);
  let showClippy = $state(false);
  let mobileWarningDismissed = $state(false);
  let windowWidth = $state(typeof window !== "undefined" ? window.innerWidth : 1024);
  let lowMemoryWarningShown = $state(false);

  const isMobile = $derived(windowWidth < 768);

  /* Load persisted settings on first mount                             */

  // We run this once at startup so settings survive page refresh.
  // The effect runs synchronously before the first render, meaning
  // the CRT overlay and desktop color are already correct at boot time.
  $effect(() => {
    const saved = loadRetroSettings();
    desktopState.crtScanlines = saved.retroCrtScanlines;
    desktopState.crtVignette = saved.retroCrtVignette;
    desktopState.crtFlicker = saved.retroCrtFlicker;
    desktopState.desktopColor = saved.retroDesktopColor;
    desktopState.soundVolume = saved.retroSoundVolume;
    desktopState.soundMuted = saved.retroSoundMuted;
    desktopState.screensaverTimeout = saved.retroScreensaverTimeout;
  });

  /* Sync sound manager with state                                       */

  $effect(() => {
    retroSound.setVolume(desktopState.soundVolume / 100);
    retroSound.setMuted(desktopState.soundMuted);
  });

  /* Start menu sound - play chime each time the menu opens             */

  $effect(() => {
    if (desktopState.startMenuOpen) {
      retroSound.startMenu();
    }
  });

  /* Auth: skip login dialog if user already has a Firebase session       */

  $effect(() => {
    if (authState.user) {
      desktopState.isAuthenticated = true;
      desktopState.userDisplayName = authState.user.displayName;
      desktopState.userEmail = authState.user.email;
    }
  });

  /** True when the login dialog should be shown (boot done, not authed). */
  const showLoginDialog = $derived(
    desktopState.bootComplete && !desktopState.isAuthenticated
  );

  /* Window resize tracking                                              */

  $effect(() => {
    function handleResize() {
      windowWidth = window.innerWidth;
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  /* Idle detection → screensaver (60s inactivity)                       */

  $effect(() => {
    if (!desktopState.bootComplete) return;

    const timeoutSec = desktopState.screensaverTimeout;
    if (timeoutSec <= 0) return; /* 0 = disabled */

    const IDLE_TIMEOUT_MS = timeoutSec * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;

    function resetIdleTimer() {
      clearTimeout(idleTimer);
      if (showScreensaver) return; /* don't restart while screensaver is active */
      idleTimer = setTimeout(() => {
        showScreensaver = true;
      }, IDLE_TIMEOUT_MS);
    }

    resetIdleTimer();

    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);
    window.addEventListener("click", resetIdleTimer);

    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("keydown", resetIdleTimer);
      window.removeEventListener("click", resetIdleTimer);
    };
  });

  /* Random Clippy appearances                                           */

  function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  let clippyTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleClippy(minMs: number, maxMs: number) {
    clearTimeout(clippyTimer);
    const delay = randomBetween(minMs, maxMs);
    clippyTimer = setTimeout(() => {
      showClippy = true;
    }, delay);
  }

  function dismissClippy() {
    showClippy = false;
    scheduleClippy(60_000, 180_000);
  }

  $effect(() => {
    if (!desktopState.bootComplete) return;

    /* First appearance: 45-120 seconds after boot */
    scheduleClippy(45_000, 120_000);

    return () => clearTimeout(clippyTimer);
  });

  function openApp(executable: string, title?: string, icon?: RetroIconName) {
    desktopState.contextMenu = null;

    /* My Computer triggers BSOD easter egg */
    if (executable === "mycomputer") {
      showBSOD = true;
      return;
    }

    const windowTitle = title ?? executable.toUpperCase();

    /* Cascade offset so multiple windows don't stack exactly */
    const offset = (windowCounter % 8) * 28;
    windowCounter++;

    /* Low memory warning after the 10th window (one-time) */
    if (windowCounter === 10 && !lowMemoryWarningShown) {
      lowMemoryWarningShown = true;
      desktopState.dialogQueue = [
        ...desktopState.dialogQueue,
        {
          title: "Low Memory Warning",
          message: "Your system is running low on memory. Close some windows.\n\nOr don't. I'm a dialog, not a cop.",
          type: "warning",
          buttons: ["OK"],
        },
      ];
    }

    /* App-specific default sizes */
    const sizes: Record<string, { width: number; height: number }> = {
      notation: { width: 640, height: 480 },
      filemgr: { width: 580, height: 400 },
      tutor: { width: 520, height: 400 },
      cards: { width: 480, height: 380 },
      control: { width: 440, height: 420 },
      upgrade: { width: 380, height: 300 },
      doom: { width: 640, height: 480 },
      defrag: { width: 440, height: 340 },
      readme: { width: 480, height: 360 },
      help: { width: 520, height: 400 },
      recyclebin: { width: 400, height: 320 },
    };
    const size = sizes[executable] ?? { width: 480, height: 360 };

    windowManager.openWindow({
      id: executable,
      title: windowTitle,
      icon: icon,
      x: 80 + offset,
      y: 40 + offset,
      width: size.width,
      height: size.height,
      minWidth: 320,
      minHeight: 240,
      isMinimized: false,
      isMaximized: false,
    });

    retroSound.windowOpen();
  }

  function openAppFromIcon(iconDef: RetroDesktopIcon) {
    openApp(iconDef.executable, iconDef.label, iconDef.icon);
  }

  /* Sound-wrapped window management                                     */

  function closeWindowWithSound(id: string) {
    retroSound.windowClose();
    windowManager.closeWindow(id);
  }

  function minimizeWindowWithSound(id: string) {
    retroSound.minimize();
    windowManager.minimizeWindow(id);
  }

  function maximizeWindowWithSound(id: string) {
    retroSound.maximize();
    windowManager.maximizeWindow(id);
  }

  function restoreWindowWithSound(id: string) {
    retroSound.maximize();
    windowManager.restoreWindow(id);
  }

  /* Deep link handling                                                  */

  $effect(() => {
    if (initialApp && desktopState.isBooting) {
      // Deep links skip the boot sequence
      desktopState.isBooting = false;
      desktopState.bootComplete = true;
      // Open the requested app
      const iconDef = [...desktopIcons, recycleBin].find(
        (i) => i.executable === initialApp
      );
      if (iconDef) {
        openAppFromIcon(iconDef);
      }
    }
  });

  /* Shut Down dialog                                                    */

  function showShutdownDialog() {
    desktopState.dialogQueue = [
      ...desktopState.dialogQueue,
      {
        title: "Shut Down TKA-OS",
        message: "What do you want the computer to do?",
        type: "question",
        buttons: ["Return to Flow Arts Composer", "Restart", "Cancel"],
      },
    ];
  }

  /* DOOM easter egg - type "DOOM" anywhere on the desktop               */

  let doomBuffer = "";

  function handleGlobalKeydown(e: KeyboardEvent) {
    /* Don't capture typing inside inputs or textareas */
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    doomBuffer += e.key.toUpperCase();
    if (doomBuffer.length > 10) doomBuffer = doomBuffer.slice(-10);

    if (doomBuffer.includes("DOOM")) {
      doomBuffer = "";
      openDoom();
    }
  }

  function openTaskManager() {
    const offset = (windowCounter % 8) * 28;
    windowCounter++;

    windowManager.openWindow({
      id: "taskmgr",
      title: "TKA-OS Task Manager",
      x: 100 + offset,
      y: 60 + offset,
      width: 400,
      height: 350,
      minWidth: 320,
      minHeight: 260,
      isMinimized: false,
      isMaximized: false,
    });

    retroSound.windowOpen();
  }

  function openDoom() {
    const offset = (windowCounter % 8) * 28;
    windowCounter++;

    windowManager.openWindow({
      id: "doom",
      title: "DOOM.EXE",
      icon: "defrag" as RetroIconName,
      x: 60 + offset,
      y: 20 + offset,
      width: 640,
      height: 480,
      minWidth: 320,
      minHeight: 240,
      isMinimized: false,
      isMaximized: false,
    });

    retroSound.windowOpen();
  }

  /* Desktop click handlers                                              */

  function handleDesktopClick() {
    desktopState.selectedDesktopIcon = null;
    desktopState.startMenuOpen = false;
    desktopState.contextMenu = null;
  }

  function selectIcon(id: string) {
    desktopState.selectedDesktopIcon = id;
  }

  /* Context menu helpers                                                */

  function showDialog(title: string, message: string) {
    desktopState.dialogQueue = [
      ...desktopState.dialogQueue,
      { title, message, type: "info", buttons: ["OK"] },
    ];
  }

  function closeContextMenu() {
    desktopState.contextMenu = null;
  }

  /* Desktop right-click menu                                            */

  function handleDesktopContextMenu(event: MouseEvent) {
    event.preventDefault();
    desktopState.startMenuOpen = false;

    const shell = (event.currentTarget as HTMLElement).closest(".retro-shell") as HTMLElement | null;
    let x = event.clientX;
    let y = event.clientY;
    if (shell) {
      const rect = shell.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
    }

    const desktopMenuItems: RetroContextMenuItem[] = [
      {
        label: "Arrange Icons",
        children: [
          { label: "by Name", action: () => showDialog("Arrange Icons", "Icons arranged by name.") },
          { label: "by Type", action: () => showDialog("Arrange Icons", "Icons arranged by type.") },
          { separator: true, label: "" },
          { label: "Auto Arrange", action: () => showDialog("Arrange Icons", "Auto arrange enabled.") },
        ],
      },
      {
        label: "Line up Icons",
        action: () => showDialog("Line up Icons", "Icons aligned to grid."),
      },
      { separator: true, label: "" },
      {
        label: "New",
        children: [
          {
            label: "Folder",
            action: () => showDialog("Access Denied", "The Order controls the filesystem."),
          },
          {
            label: "Text Document",
            action: () => showDialog("Access Denied", "The Order controls the filesystem."),
          },
        ],
      },
      { separator: true, label: "" },
      {
        label: "Properties",
        action: () => openApp("control", "Control Panel", "control"),
      },
    ];

    desktopState.contextMenu = { x, y, items: desktopMenuItems };
  }

  /* Icon right-click menu                                               */

  function handleIconContextMenu(event: MouseEvent, iconDef: RetroDesktopIcon) {
    desktopState.startMenuOpen = false;

    const shell = (event.target as HTMLElement).closest(".retro-shell") as HTMLElement | null;
    let x = event.clientX;
    let y = event.clientY;
    if (shell) {
      const rect = shell.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
    }

    const sizeKB = ((iconDef.label.length * 80) + 200).toString();

    const iconMenuItems: RetroContextMenuItem[] = [
      {
        label: "Open",
        action: () => openAppFromIcon(iconDef),
        isDefault: true,
      },
      { separator: true, label: "" },
      {
        label: "Delete",
        action: () => showDialog(
          "Delete",
          "The Order forbids deletion of sacred executables.",
        ),
      },
      {
        label: "Rename",
        action: () => showDialog(
          "Rename",
          "This file is protected by the Bellweather Technical Institute.",
        ),
      },
      { separator: true, label: "" },
      {
        label: "Properties",
        action: () => showDialog(
          `${iconDef.label} Properties`,
          `${iconDef.label}\nType: Application\nSize: ${sizeKB} KB`,
        ),
      },
    ];

    desktopState.contextMenu = { x, y, items: iconMenuItems };
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard shortcuts                                                  */
  /* ------------------------------------------------------------------ */

  function handleKeyboardShortcut(e: KeyboardEvent) {
    // Don't capture when focused on input/textarea - let them handle their own keys
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    // Alt+F4: Close the active (focused) window
    if (e.altKey && e.key === "F4") {
      e.preventDefault();
      if (desktopState.activeWindowId) {
        closeWindowWithSound(desktopState.activeWindowId);
      }
      return;
    }

    // Ctrl+Escape: Toggle Start menu
    if (e.ctrlKey && e.key === "Escape") {
      e.preventDefault();
      desktopState.startMenuOpen = !desktopState.startMenuOpen;
      return;
    }

    // Ctrl+Alt+Delete: Open Task Manager
    if (e.ctrlKey && e.altKey && (e.key === "Delete" || e.key === "Del")) {
      e.preventDefault();
      openTaskManager();
      return;
    }

    // Escape: Close menus in priority order
    if (e.key === "Escape") {
      if (desktopState.startMenuOpen) {
        desktopState.startMenuOpen = false;
        return;
      }
      if (desktopState.contextMenu) {
        desktopState.contextMenu = null;
        return;
      }
    }

    // DOOM easter egg: type "DOOM" anywhere on the desktop
    handleGlobalKeydown(e);
  }

  /* Boot completion is handled by RetroBootSequence via oncomplete */
</script>

<svelte:window onkeydown={handleKeyboardShortcut} />

{#if isMobile && !mobileWarningDismissed}
  <div class="retro-desk">
    <div class="retro-monitor">
      <div class="retro-screen">
        <div class="retro-shell">
          <RetroMobileWarning onproceed={() => (mobileWarningDismissed = true)} />
        </div>
      </div>
      <div class="retro-monitor-label">
        <span class="monitor-led"></span>
        <span class="monitor-brand">BELLWEATHER &nbsp;TKA-1500</span>
      </div>
    </div>
  </div>
{:else}
<div class="retro-desk">
<div class="retro-monitor">
<div class="retro-screen">
<div class="retro-shell">
  {#if desktopState.isBooting}
    <RetroBootSequence oncomplete={() => {
      desktopState.isBooting = false;
      desktopState.bootComplete = true;
      retroSound.startup();
      /* Auto-open TKA Notation System like a real Win95 startup program */
      openApp("notation", "TKA Notation System", "scribe");
    }} />
  {:else}
    <!-- Login dialog (shown after boot, before auth) -->
    {#if showLoginDialog}
      <RetroLoginDialog
        onsuccess={() => retroSound.loginSuccess()}
        onfail={() => retroSound.loginFail()}
      />
    {/if}

    <!-- Desktop surface -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="desktop-surface"
      class:desktop-locked={showLoginDialog}
      onclick={handleDesktopClick}
      oncontextmenu={handleDesktopContextMenu}
      style:background={desktopState.desktopColor}
    >
      <!-- Desktop icons: left column -->
      <div class="desktop-icon-grid">
        {#each desktopIcons as iconDef (iconDef.id)}
          <RetroDesktopIconComponent
            icon={iconDef}
            isSelected={desktopState.selectedDesktopIcon === iconDef.id}
            onselect={() => selectIcon(iconDef.id)}
            ondoubleclick={() => openAppFromIcon(iconDef)}
            oncontextmenu={(e) => handleIconContextMenu(e, iconDef)}
          />
        {/each}
      </div>

      <!-- Recycle Bin: bottom-right corner -->
      <div class="recycle-bin-position">
        <RetroDesktopIconComponent
          icon={recycleBin}
          isSelected={desktopState.selectedDesktopIcon === recycleBin.id}
          onselect={() => selectIcon(recycleBin.id)}
          ondoubleclick={() => openAppFromIcon(recycleBin)}
          oncontextmenu={(e) => handleIconContextMenu(e, recycleBin)}
        />
      </div>

      <!-- Open windows -->
      {#each desktopState.windows as win (win.id)}
        {#if !win.isMinimized}
          <RetroWindow
            id={win.id}
            title={win.title}
            icon={win.icon}
            bind:x={win.x}
            bind:y={win.y}
            bind:width={win.width}
            bind:height={win.height}
            bind:isMinimized={win.isMinimized}
            bind:isMaximized={win.isMaximized}
            isActive={desktopState.activeWindowId === win.id}
            onfocus={() => windowManager.focusWindow(win.id)}
            onclose={() => closeWindowWithSound(win.id)}
            onminimize={() => minimizeWindowWithSound(win.id)}
            onmaximize={() => maximizeWindowWithSound(win.id)}
            onrestore={() => restoreWindowWithSound(win.id)}
            onmove={(newX, newY) => windowManager.moveWindow(win.id, newX, newY)}
            onresize={(w, h) => windowManager.resizeWindow(win.id, w, h)}
          >
            {#snippet children()}
              {#if win.id === "notation"}
                <RetroScribe onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "filemgr"}
                <RetroFileManager onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "tutor"}
                <RetroTutor onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "cards"}
                <RetroCards onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "control"}
                <RetroControlPanel onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "upgrade"}
                <RetroUpgrade onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "readme"}
                <RetroReadme onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "help"}
                <RetroHelp onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "defrag"}
                <RetroDefrag onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "doom"}
                <RetroDoom onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "recyclebin"}
                <RetroRecycleBin onclose={() => closeWindowWithSound(win.id)} />
              {:else if win.id === "taskmgr"}
                <RetroTaskManager onclose={() => closeWindowWithSound(win.id)} />
              {:else}
                <div class="placeholder-content">
                  <p>{win.title}</p>
                  <p class="placeholder-hint">Module adapter coming soon.</p>
                </div>
              {/if}
            {/snippet}
          </RetroWindow>
        {/if}
      {/each}
    </div>

    <!-- Context menu -->
    {#if desktopState.contextMenu}
      <RetroContextMenu
        x={desktopState.contextMenu.x}
        y={desktopState.contextMenu.y}
        items={desktopState.contextMenu.items}
        onclose={closeContextMenu}
      />
    {/if}

    <!-- Start menu -->
    {#if desktopState.startMenuOpen}
      <RetroStartMenu
        items={startMenuItems}
        onclose={() => (desktopState.startMenuOpen = false)}
      />
    {/if}

    <!-- Taskbar -->
    <RetroTaskbar {windowManager} />

    <!-- Clippy assistant (z-index 9000) -->
    {#if showClippy}
      <RetroClippy ondismiss={() => dismissClippy()} />
    {/if}

    <!-- Screensaver (z-index 9500, above Clippy) -->
    {#if showScreensaver}
      <RetroScreensaver ondismiss={() => (showScreensaver = false)} />
    {/if}

    <!-- CRT monitor effect (z-index 9999) -->
    <CRTOverlay
      scanlines={desktopState.crtScanlines}
      vignette={desktopState.crtVignette}
      flicker={desktopState.crtFlicker}
    />

    <!-- BSOD easter egg (z-index 10000, above CRT overlay) -->
    {#if showBSOD}
      <RetroBSOD ondismiss={() => (showBSOD = false)} />
    {/if}
  {/if}
</div>
</div>
<div class="retro-monitor-label">
  <span class="monitor-led"></span>
  <span class="monitor-brand">BELLWEATHER &nbsp;TKA-1500</span>
</div>
</div>
</div>
{/if}

<style>
  /* Layer 1: Desk - dark background filling the viewport                */
  .retro-desk {
    background: #1a1410;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0;
    margin: 0;
  }

  /* Layer 2: Monitor - beige plastic CRT bezel                          */
  .retro-monitor {
    position: relative;
    width: min(1100px, 92vw);
    aspect-ratio: 4 / 3;
    max-height: 90vh;
    background: #d4c5a9;
    border-radius: 18px;
    padding: 24px 24px 40px 24px;
    box-shadow:
      0 4px 32px rgba(0, 0, 0, 0.6),
      0 0 2px rgba(255, 255, 255, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  /* Layer 3: Screen - inset glass area inside the bezel                 */
  .retro-screen {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.6);
  }

  /* Brand label - centered in the bottom bezel padding                  */
  .retro-monitor-label {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }

  .monitor-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2ecc40;
    box-shadow: 0 0 4px rgba(46, 204, 64, 0.6);
  }

  .monitor-brand {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #6b5e4a;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: 600;
  }

  /* Shell - the OS fills the screen area                                */
  .retro-shell {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    font-family: var(
      --retro-font-family,
      "Microsoft Sans Serif",
      Arial,
      sans-serif
    );
    font-size: var(--retro-font-size, 11px);
  }

  /* Desktop surface                                                     */
  .desktop-surface {
    position: absolute;
    inset: 0;
    bottom: 28px; /* Leave room for taskbar */
    background: var(--retro-desktop-bg, #008080);
    z-index: var(--retro-z-desktop, 0);
  }

  /* Disable all interaction when the login dialog is showing */
  .desktop-surface.desktop-locked {
    pointer-events: none;
    user-select: none;
  }

  /* Desktop icon grid - left column                                     */
  .desktop-icon-grid {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 1;
  }

  /* Recycle Bin - bottom-right                                          */
  .recycle-bin-position {
    position: absolute;
    bottom: 8px;
    right: 8px;
    z-index: 1;
  }

  /* Placeholder content for windows                                     */
  .placeholder-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 16px;
    text-align: center;
    color: var(--retro-black, #000);
  }

  .placeholder-hint {
    color: var(--retro-dark-gray, #808080);
    margin-top: 4px;
  }
</style>
