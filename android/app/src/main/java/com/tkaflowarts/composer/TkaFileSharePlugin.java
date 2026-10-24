package com.tkaflowarts.composer;

import android.content.ClipData;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Parcelable;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Hands one file to the Android share sheet.
 *
 * The app's WebView has no navigator.share at all (Android WebView never
 * implemented the Web Share API), so without this Share in the app could only
 * offer links and in-app sending; a card could not reach Instagram, Messages
 * or anything else on the phone. file-downloader.ts calls this from
 * shareBlobNatively when the browser API is missing.
 *
 * The file is written under cache/shared/, which file_paths.xml already
 * exposes through the app's FileProvider. Each share replaces the last one,
 * so the folder never grows past a single file.
 */
@CapacitorPlugin(name = "TkaFileShare")
public class TkaFileSharePlugin extends Plugin {

    private static final String SHARE_DIR = "shared";

    @PluginMethod
    public void shareFile(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String title = call.getString("title");
        String text = call.getString("text");
        if (data == null || filename == null || filename.isEmpty()) {
            call.reject("data and filename are required");
            return;
        }

        Uri uri;
        try {
            File dir = new File(getContext().getCacheDir(), SHARE_DIR);
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Could not create the share folder");
                return;
            }
            File[] previous = dir.listFiles();
            if (previous != null) {
                for (File old : previous) old.delete();
            }
            // The filename comes from the web side already sanitized; strip any
            // path separators anyway so it can never leave the share folder.
            File file = new File(dir, filename.replaceAll("[/\\\\]", "_"));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
        } catch (Exception e) {
            call.reject("Could not prepare the file", e);
            return;
        }

        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_TITLE, title);
        // ClipData carries the read grant to whichever app is picked, and lets
        // the sheet draw its preview of the image.
        send.setClipData(ClipData.newRawUri(filename, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        Intent chooser = Intent.createChooser(send, title);
        // This app is itself a share target; offering it back to itself here
        // would just reopen the app on its own file.
        chooser.putExtra(
            Intent.EXTRA_EXCLUDE_COMPONENTS,
            new Parcelable[] {
                new ComponentName(getContext(), MainActivity.class)
            }
        );
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            getActivity().startActivity(chooser);
        } catch (Exception e) {
            call.reject("Could not open the share sheet", e);
            return;
        }

        // The chooser does not report what was picked or whether it was
        // dismissed, so "shown" is all that can honestly be said.
        JSObject result = new JSObject();
        result.put("shown", true);
        call.resolve(result);
    }
}
