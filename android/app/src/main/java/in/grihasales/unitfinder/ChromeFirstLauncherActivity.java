package in.grihasales.unitfinder;

import android.content.pm.ApplicationInfo;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

/**
 * Opens Unit Finder in Chrome when Chrome is installed, instead of the phone's default browser.
 * Samsung Internet, the default on many Samsung phones, refuses to share PDF files to WhatsApp
 * ("NotAllowedError"); Chrome shares them. Without Chrome the default browser is used as before.
 */
public class ChromeFirstLauncherActivity extends LauncherActivity {
    private static final String[] PREFERRED = {
        "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary"
    };

    @Override
    protected TwaLauncher createTwaLauncher() {
        for (String pkg : PREFERRED) {
            try {
                ApplicationInfo info = getPackageManager().getApplicationInfo(pkg, 0);
                if (info.enabled) return new TwaLauncher(this, pkg);
            } catch (Exception e) {
                // not installed: try the next one
            }
        }
        return super.createTwaLauncher();
    }
}
