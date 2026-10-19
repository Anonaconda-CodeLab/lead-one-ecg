package com.anonacondacodelab.leadone;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Native stand-ins for browser features that Android's WebView lacks. Nothing here uses the network. */
@CapacitorPlugin(
    name = "LeadOne",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class LeadOnePlugin extends Plugin {

    /* Save a text file (history backup, recording) through Android's own "save as" screen. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(call.getString("mime", "application/json"));
        i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "LeadOne-ECG.json"));
        startActivityForResult(call, i, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Uri uri = result.getData() != null ? result.getData().getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { r.put("saved", false); call.resolve(r); return; }
        try (OutputStream os = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            os.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            r.put("saved", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "write failed");
        }
    }

    /* Print the report; Android's print screen offers "Save as PDF". Resolves when the print screen closes. */
    @PluginMethod
    public void print(PluginCall call) {
        final String name = call.getString("name", "Lead One ECG report");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                final PrintDocumentAdapter base = getBridge().getWebView().createPrintDocumentAdapter(name);
                PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                    @Override public void onStart() { base.onStart(); }
                    @Override public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal c, LayoutResultCallback cb, Bundle extras) { base.onLayout(o, n, c, cb, extras); }
                    @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor d, CancellationSignal c, WriteResultCallback cb) { base.onWrite(pages, d, c, cb); }
                    @Override public void onFinish() { base.onFinish(); call.resolve(); }
                };
                PrintAttributes attrs = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
                pm.print(name, adapter, attrs);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "print failed");
            }
        });
    }

    @PluginMethod
    public void keepScreenOn(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /* pattern as in the web Vibration API: [on, off, on, ...] in ms */
    @PluginMethod
    public void vibrate(PluginCall call) {
        try {
            JSArray a = call.getArray("pattern", new JSArray());
            long[] p = new long[a.length() + 1];
            p[0] = 0;
            for (int k = 0; k < a.length(); k++) p[k + 1] = a.getLong(k);
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(p, -1));
                else v.vibrate(p, -1);
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    /* Recording with the screen off: a foreground service with a partial wake lock keeps the app running. */
    @PluginMethod
    public void startRecording(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotificationPermission");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) { startService(call); }   // the service runs either way; the permission only shows its notification

    private void startService(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), RecordingService.class);
            i.putExtra("text", call.getString("text", "Recording ECG"));
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "service failed");
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        getContext().stopService(new Intent(getContext(), RecordingService.class));
        call.resolve();
    }
}
