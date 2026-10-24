package com.tkaflowarts.composer;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must precede super.onCreate: the bridge registers plugins during it.
        registerPlugin(TkaSharingShortcutsPlugin.class);
        registerPlugin(TkaFileSharePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Keep getIntent() pointing at the intent that actually just arrived.
     *
     * Android only updates getIntent() when an activity calls setIntent();
     * otherwise it returns the intent that originally STARTED the activity, for
     * the activity's whole lifetime. Capacitor's BridgeActivity.onNewIntent
     * (BridgeActivity.java:198-206) forwards to super and to bridge.onNewIntent
     * but never calls setIntent, so on a warm resume getIntent() is stale.
     *
     * TkaSharingShortcutsPlugin reads EXTRA_SHORTCUT_ID off getIntent(). Without
     * this override, sharing to a Direct Share target worked exactly once per
     * app lifetime: the second share read the FIRST share's target (wrong
     * person) or null once consume-once had stripped it. Found on device
     * 2026-07-30 - no unit test can see it, because the whole defect lives in
     * Android's activity contract.
     *
     * @capgo/capacitor-share-target is unaffected: it reads the intent passed
     * into handleOnNewIntent directly rather than calling getIntent().
     */
    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
