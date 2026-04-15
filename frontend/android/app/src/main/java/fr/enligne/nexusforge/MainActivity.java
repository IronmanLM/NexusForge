package fr.enligne.nexusforge;

import android.content.IntentSender;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NexusForgeUpdate";
    private static final int IN_APP_UPDATE_REQUEST_CODE = 41026;

    private AppUpdateManager appUpdateManager;
    private boolean updateCheckInProgress = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        appUpdateManager = AppUpdateManagerFactory.create(getApplicationContext());
    }

    @Override
    public void onResume() {
        super.onResume();
        checkForImmediateUpdate();
    }

    private void checkForImmediateUpdate() {
        if (appUpdateManager == null || updateCheckInProgress) {
            return;
        }
        updateCheckInProgress = true;
        appUpdateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(this::handleAppUpdateInfo)
            .addOnFailureListener(error -> {
                updateCheckInProgress = false;
                Log.w(TAG, "Impossible de verifier la mise a jour Play", error);
            });
    }

    private void handleAppUpdateInfo(AppUpdateInfo appUpdateInfo) {
        updateCheckInProgress = false;

        if (appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
            startImmediateUpdateFlow(appUpdateInfo);
            return;
        }

        if (appUpdateInfo.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) {
            return;
        }

        if (!appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
            Log.i(TAG, "Mise a jour disponible mais le mode immediat n est pas autorise.");
            return;
        }

        startImmediateUpdateFlow(appUpdateInfo);
    }

    private void startImmediateUpdateFlow(AppUpdateInfo appUpdateInfo) {
        if (appUpdateManager == null) {
            return;
        }
        try {
            appUpdateManager.startUpdateFlowForResult(
                appUpdateInfo,
                AppUpdateType.IMMEDIATE,
                this,
                IN_APP_UPDATE_REQUEST_CODE
            );
        } catch (IntentSender.SendIntentException error) {
            Log.e(TAG, "Impossible de lancer la mise a jour immediate", error);
        }
    }
}
