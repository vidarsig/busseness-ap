package app.jobboks.twa;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;

public class MainActivity extends Activity {

    private static final int CAMERA_PERMISSION_REQUEST = 100;
    private static final int FILECHOOSER_CAMERA_PERMISSION_REQUEST = 101;
    private static final int FILE_CHOOSER_REQUEST = 200;

    private PermissionRequest pendingPermissionRequest;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen, no title bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        // Status bar colour to match the app (#1e3a8a)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.parseColor("#1e3a8a"));

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Allow cookies (needed for app state / auth)
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            // Live camera stream requests (getUserMedia)
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (checkSelfPermission(android.Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    pendingPermissionRequest = request;
                    requestPermissions(
                        new String[]{android.Manifest.permission.CAMERA},
                        CAMERA_PERMISSION_REQUEST
                    );
                }
            }

            // HTML <input type="file"> — open camera + gallery picker
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                if (checkSelfPermission(android.Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    launchChooser(true);
                } else {
                    requestPermissions(
                        new String[]{android.Manifest.permission.CAMERA},
                        FILECHOOSER_CAMERA_PERMISSION_REQUEST
                    );
                }
                return true;
            }
        });

        // Stay inside the app — don't open links in the system browser
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://jobboks.app") || url.startsWith("http://jobboks.app")) {
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl("https://jobboks.app/");
        }
    }

    private void launchChooser(boolean withCamera) {
        Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
        contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
        contentIntent.setType("image/*");

        Intent chooser = new Intent(Intent.ACTION_CHOOSER);
        chooser.putExtra(Intent.EXTRA_INTENT, contentIntent);
        chooser.putExtra(Intent.EXTRA_TITLE, "Select receipt");

        cameraImageUri = null;
        if (withCamera) {
            Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (cameraIntent.resolveActivity(getPackageManager()) != null) {
                File photoFile = createImageFile();
                if (photoFile != null) {
                    cameraImageUri = FileProvider.getUriForFile(
                        this, getPackageName() + ".fileprovider", photoFile);
                    cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                    cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cameraIntent});
                }
            }
        }

        try {
            startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
        } catch (Exception e) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
        }
    }

    private File createImageFile() {
        try {
            File dir = new File(getCacheDir(), "receipts");
            if (!dir.exists()) dir.mkdirs();
            return File.createTempFile("receipt_", ".jpg", dir);
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data != null && data.getData() != null) {
                    results = new Uri[]{ data.getData() };          // gallery / file pick
                } else if (cameraImageUri != null) {
                    results = new Uri[]{ cameraImageUri };           // camera capture
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            cameraImageUri = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == CAMERA_PERMISSION_REQUEST && pendingPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
        } else if (requestCode == FILECHOOSER_CAMERA_PERMISSION_REQUEST) {
            boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            // Launch with camera if granted, gallery-only otherwise
            launchChooser(granted);
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
