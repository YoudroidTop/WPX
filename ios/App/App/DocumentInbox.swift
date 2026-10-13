import Foundation
import Capacitor

final class DocumentInboxStore {
    static let shared = DocumentInboxStore()
    static let changed = Notification.Name("ZhuoleInboxChanged")
    private let queue = DispatchQueue(label: "com.youdroid.zhuoledocs.inbox")
    private let maximumBytes = 10_000_000
    private let extensions: Set<String> = ["docx", "xlsx", "pptx", "zdoc"]
    private var pendingError: String?
    private var directory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("DocumentInbox", isDirectory: true)
    }
    private func files() throws -> [URL] {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])
            .filter { !$0.lastPathComponent.hasPrefix(".") }
            .sorted {
                let first = (try? $0.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                let second = (try? $1.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                return first < second
            }
    }
    func receive(_ url: URL) {
        queue.async {
            do {
                guard url.isFileURL, self.extensions.contains(url.pathExtension.lowercased()) else { throw InboxError.invalid }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let localInbox = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Inbox").standardizedFileURL.path + "/"
                guard scoped || url.resolvingSymlinksInPath().path.hasPrefix(localInbox) else { throw InboxError.access }
                guard try self.files().count < 8 else { throw InboxError.full }
                var failure: Error?
                var coordinationError: NSError?
                NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinated in
                    do {
                        let handle = try FileHandle(forReadingFrom: coordinated)
                        defer { try? handle.close() }
                        var bytes = Data()
                        while let chunk = try handle.read(upToCount: 8192), !chunk.isEmpty {
                            guard bytes.count + chunk.count <= self.maximumBytes else { throw InboxError.large }
                            bytes.append(chunk)
                        }
                        let target = self.directory.appendingPathComponent(UUID().uuidString + "_" + coordinated.lastPathComponent)
                        try bytes.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                        var excluded = target
                        var values = URLResourceValues()
                        values.isExcludedFromBackup = true
                        try excluded.setResourceValues(values)
                    } catch { failure = error }
                }
                if let error = coordinationError { throw error }
                if let error = failure { throw error }
            } catch { self.pendingError = error.localizedDescription }
            DispatchQueue.main.async { NotificationCenter.default.post(name: Self.changed, object: nil) }
        }
    }
    func take(_ call: CAPPluginCall) {
        queue.async {
            do {
                if let error = self.pendingError { self.pendingError = nil; call.reject(error); return }
                guard let file = try self.files().first else { call.resolve(["file": NSNull()]); return }
                let bytes = try Data(contentsOf: file)
                let payload: JSObject = ["name": String(file.lastPathComponent.dropFirst(37)), "data": bytes.base64EncodedString()]
                try FileManager.default.removeItem(at: file)
                call.resolve(["file": payload])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    private enum InboxError: LocalizedError {
        case invalid, access, large, full
        var errorDescription: String? {
            switch self {
            case .invalid: return "请选择 DOCX、XLSX、PPTX 或 ZDOC 文件"
            case .access: return "无法读取文件，请从系统文件应用重新打开"
            case .large: return "文件超过 10 MB"
            case .full: return "请先处理待导入文件，最多同时接收 8 份"
            }
        }
    }
}

@objc(DocumentInboxPlugin)
final class DocumentInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "DocumentInboxPlugin"
    let jsName = "DocumentInbox"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise)]
    private var observer: NSObjectProtocol?
    override func load() {
        observer = NotificationCenter.default.addObserver(forName: DocumentInboxStore.changed, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("filesAvailable", data: [:])
        }
    }
    deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
    @objc func take(_ call: CAPPluginCall) { DocumentInboxStore.shared.take(call) }
}

final class DocumentBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(DocumentInboxPlugin()) }
}
