package com.youdroid.zhuoledocs;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DocumentInbox")
public class DocumentInboxPlugin extends Plugin {
    private final ExecutorService queue = Executors.newSingleThreadExecutor();
    private String pendingError;
    private File directory() { return new File(getContext().getNoBackupFilesDir(), "DocumentInbox"); }
    private File[] files() throws IOException {
        File directory = directory();
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法保存待导入文件");
        File[] files = directory.listFiles(file -> file.isFile() && !file.getName().startsWith("."));
        if (files == null) throw new IOException("无法读取待导入文件");
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        return files;
    }
    @Override public void load() { receive(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) { receive(intent); }
    private void receive(Intent intent) {
        if (intent == null || intent.getBooleanExtra("com.youdroid.zhuoledocs.INBOX_RECEIVED", false)) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) uris.add(intent.getData());
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> received = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (received != null) uris.addAll(received);
        }
        if (uris.isEmpty()) return;
        intent.putExtra("com.youdroid.zhuoledocs.INBOX_RECEIVED", true);
        queue.execute(() -> {
            for (Uri uri : uris) {
                try { copy(uri); } catch (Exception error) { pendingError = error.getMessage(); }
            }
            notifyListeners("filesAvailable", new JSObject());
        });
    }
    private void copy(Uri uri) throws IOException {
        if (!"content".equals(uri.getScheme())) throw new IOException("请通过系统文件应用分享文档");
        String name = "";
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
        }
        if (name == null || name.contains("/") || name.contains("\\") || !name.toLowerCase(Locale.ROOT).matches(".+\\.(docx|xlsx|pptx|zdoc)"))
            throw new IOException("请选择 DOCX、XLSX、PPTX 或 ZDOC 文件");
        if (files().length >= 8) throw new IOException("请先处理待导入文件，最多同时接收 8 份");
        File temporary = new File(directory(), "." + UUID.randomUUID());
        try {
            try (InputStream source = getContext().getContentResolver().openInputStream(uri); OutputStream target = new FileOutputStream(temporary)) {
                if (source == null) throw new IOException("无法读取文件");
                byte[] buffer = new byte[8192];
                int total = 0, count;
                while ((count = source.read(buffer)) != -1) {
                    total += count;
                    if (total > 10_000_000) throw new IOException("文件超过 10 MB");
                    target.write(buffer, 0, count);
                }
            }
            if (!temporary.renameTo(new File(directory(), UUID.randomUUID() + "_" + name))) throw new IOException("无法保存待导入文件");
        } finally { if (temporary.exists()) temporary.delete(); }
    }
    @PluginMethod public void take(PluginCall call) {
        queue.execute(() -> {
            try {
                if (pendingError != null) { String error = pendingError; pendingError = null; call.reject(error); return; }
                File[] files = files();
                JSObject result = new JSObject();
                if (files.length == 0) { result.put("file", org.json.JSONObject.NULL); call.resolve(result); return; }
                File file = files[0];
                byte[] bytes;
                try (InputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    bytes = output.toByteArray();
                }
                JSObject payload = new JSObject();
                payload.put("name", file.getName().substring(37));
                payload.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                if (!file.delete()) throw new IOException("无法完成文件读取");
                result.put("file", payload); call.resolve(result);
            } catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @Override protected void handleOnDestroy() { queue.shutdown(); }
}
