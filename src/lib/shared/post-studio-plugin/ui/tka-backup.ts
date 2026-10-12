import type { PluginBackup } from "@austencloud/video-editor";
import { readInShotRecoveryPackage } from "#lib/shared/media-composition/services/inshot-recovery-package.js";
import { loadPostProjectFonts } from "@austencloud/video-editor/ui";
import {
  parsePostStudioBackup,
  serializePostStudioBackup,
} from "#lib/shared/media-composition/services/post-project-backup.js";

/**
 * tka's Backup, Restore and Import: a `.post-studio.json` backup of the
 * post, and the InShot recovery package with its media.
 */
export const TKA_BACKUP: PluginBackup = {
  accept: ".json,video/*,image/*,.ttf,.otf",
  serialize(editor) {
    const blob = new Blob([serializePostStudioBackup(editor.snapshot)], {
      type: "application/json",
    });
    return { blob, filename: `${editor.subjectId}-mapped.post-studio.json` };
  },
  async importFiles(editor, selected) {
    const backupFile = selected.find((file) =>
      file.name.endsWith(".post-studio.json")
    );
    const backup = backupFile
      ? parsePostStudioBackup(await backupFile.text(), editor.subjectId)
      : null;
    if (backup) {
      const files = new Map(selected.map((file) => [file.name, file]));
      await loadPostProjectFonts(backup, files);
      return { project: backup, files };
    }
    // The open post's own media, to relink.
    if (!selected.some((file) => file.name.endsWith(".post-studio.json"))) {
      return null;
    }
    return readInShotRecoveryPackage(selected, editor.subjectId, Date.now());
  },
};
