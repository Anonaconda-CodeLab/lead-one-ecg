package com.anonacondacodelab.leadone;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LeadOnePlugin.class);
        super.onCreate(savedInstanceState);
        // Back goes back inside the app; on the home or recording screen the app moves to the background
        // instead of closing, so a recording in progress is never ended by the Back button.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) { moveTaskToBack(true); return; }
                bridge.getWebView().evaluateJavascript("(window.leadOneBack && window.leadOneBack()) ? 1 : 0", r -> {
                    if (!"1".equals(r)) moveTaskToBack(true);
                });
            }
        });
    }
}
