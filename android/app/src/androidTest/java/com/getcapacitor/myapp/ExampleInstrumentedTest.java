package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.youdroid.zhuoledocs.MainActivity;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {
    @Test
    public void sharedDocumentIsCopiedAndSurvivesActivityRestart() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String name = "intent-test-" + UUID.randomUUID() + ".zdoc";
        File source = new File(context.getCacheDir(), name);
        byte[] content = "{\"fixture\":\"native-inbox\"}".getBytes(StandardCharsets.UTF_8);
        Files.write(source.toPath(), content);
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", source);
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_SEND)
            .setType("application/vnd.youdroid.zdoc")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        File inbox = new File(context.getNoBackupFilesDir(), "DocumentInbox");
        File received = null;
        try {
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(intent)) {
                long deadline = System.nanoTime() + 10_000_000_000L;
                while (System.nanoTime() < deadline) {
                    File[] matches = inbox.listFiles(file -> file.getName().endsWith("_" + name));
                    if (matches != null && matches.length > 0) { received = matches[0]; break; }
                    Thread.sleep(50);
                }
                assertNotNull("Shared document must reach the private inbox", received);
                assertArrayEquals(content, Files.readAllBytes(received.toPath()));
            }
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                assertTrue("Pending document must survive activity restart", received.isFile());
                assertArrayEquals(content, Files.readAllBytes(source.toPath()));
            }
        } finally {
            source.delete();
            File[] matches = inbox.listFiles(file -> file.getName().endsWith("_" + name));
            if (matches != null) for (File file : matches) file.delete();
        }
    }
}
