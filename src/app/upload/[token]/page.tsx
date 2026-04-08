"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import { Upload, CheckCircle, AlertCircle, Loader2, Film, Image as ImageIcon, Music, X, FileUp, Check, FileText } from "lucide-react";

interface ClientInfo {
  id: string;
  name: string;
  company?: string;
  avatarUrl?: string;
}

interface UploadResult {
  filename: string;
  url?: string;
  id?: string;
  error?: string;
}

export default function ClientUploadPortal({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t);
      fetch(`/api/client-media/upload-portal?token=${t}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setClient(d.data);
          else setInvalid(true);
        })
        .catch(() => setInvalid(true))
        .finally(() => setLoading(false));
    });
  }, [params]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
    setResults([]);
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUpload = async () => {
    if (files.length === 0 || !token || !client) return;
    setUploading(true);
    setUploadProgress(0);
    setResults([]);

    const allResults: UploadResult[] = [];
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    let uploadedSize = 0;

    for (const file of files) {
      try {
        const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
        const blobPath = `client-media/${client.id}/${safeName}`;

        const blob = await upload(blobPath, file, {
          access: "public",
          handleUploadUrl: "/api/client-media/upload-portal",
          contentType: file.type || undefined,
          clientPayload: JSON.stringify({
            token,
            filename: file.name,
            size: file.size,
          }),
          onUploadProgress: ({ loaded }) => {
            const overall = uploadedSize + loaded;
            setUploadProgress(Math.min(100, Math.round((overall / totalSize) * 100)));
          },
        });

        allResults.push({ filename: file.name, url: blob.url });
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : "Upload failed. Please try again.";
        allResults.push({ filename: file.name, error: message });
      }

      uploadedSize += file.size;
      setUploadProgress(Math.min(100, Math.round((uploadedSize / totalSize) * 100)));
      setResults([...allResults]);
    }

    setFiles([]);
    setUploading(false);
    setUploadProgress(0);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return <ImageIcon size={16} className="text-blue-400" />;
    if (file.type.startsWith("video/")) return <Film size={16} className="text-purple-400" />;
    if (file.type.startsWith("audio/")) return <Music size={16} className="text-green-400" />;
    if (file.type === "application/pdf" || file.type.startsWith("application/vnd.") || file.type.startsWith("application/ms") || file.type.startsWith("text/"))
      return <FileText size={16} className="text-orange-400" />;
    return <FileUp size={16} className="text-gray-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
      </div>
    );
  }

  if (invalid || !client) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Upload Link</h1>
          <p className="text-sm text-gray-400">
            This upload link is expired or invalid. Please contact your manager for a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C]">
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          {client.avatarUrl ? (
            <img src={client.avatarUrl} alt="" className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-white/10" />
          ) : (
            <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white text-xl font-bold">
              {client.name.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold text-white mb-1">Upload Files</h1>
          <p className="text-sm text-gray-400">
            {client.company || client.name} &middot; Upload your photos, videos, audio, and documents
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver
              ? "border-orange-500 bg-orange-500/5 scale-[1.01]"
              : "border-white/10 hover:border-white/20 bg-white/[0.02]"
          }`}
        >
          <div className={`p-4 rounded-full transition-colors ${dragOver ? "bg-orange-500/10" : "bg-white/5"}`}>
            <Upload size={32} className={dragOver ? "text-orange-400" : "text-white/40"} />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Drag & drop files here</p>
            <p className="text-xs text-gray-500 mt-1">or</p>
            <span className="inline-block mt-2 px-5 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors">
              Browse Files
            </span>
            <p className="text-xs text-gray-500 mt-3">
              Photos, videos, audio, and documents &middot; Up to 500MB per file
            </p>
            <p className="text-xs text-gray-600 mt-1">
              All image &amp; video formats, PDF, Word, Excel, PowerPoint, and more
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            if (picked.length) {
              addFiles(picked);
            }
            e.target.value = "";
          }}
        />

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-white">{files.length} file{files.length !== 1 ? "s" : ""} selected</h2>
              <button
                type="button"
                onClick={() => setFiles([])}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Clear all
              </button>
            </div>
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                {getFileIcon(file)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-[10px] text-gray-500">{formatSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => removeFile(idx)} className="text-gray-600 hover:text-white">
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Ready to submit indicator */}
            {!uploading && (
              <div className="flex items-center gap-2 mt-4 px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <Check size={14} className="text-orange-400 shrink-0" />
                <p className="text-xs text-orange-300">
                  {files.length} file{files.length !== 1 ? "s" : ""} ready to upload ({formatSize(files.reduce((s, f) => s + f.size, 0))} total)
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full mt-3 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 relative overflow-hidden"
            >
              {uploading ? (
                <>
                  {/* Progress bar background */}
                  <div
                    className="absolute inset-0 bg-white/10 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                  <span className="relative flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Uploading... {uploadProgress}%
                  </span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Upload {files.length} file{files.length !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-green-400" />
              <h2 className="text-sm font-medium text-white">
                {results.filter((r) => !r.error).length} file{results.filter((r) => !r.error).length !== 1 ? "s" : ""} uploaded successfully
              </h2>
            </div>

            {/* Thumbnail grid for successful uploads */}
            {results.some((r) => r.url) && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {results.filter((r) => r.url).map((r, idx) => (
                  <div key={idx} className="relative rounded-xl overflow-hidden bg-white/[0.03] border border-green-500/20 aspect-square">
                    {r.filename.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|avif|svg)$/i) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.url} alt={r.filename} className="w-full h-full object-cover" />
                    ) : r.filename.match(/\.(mp4|mov|webm|avi|mkv|wmv|flv|3gp|m4v|ogv|ts)$/i) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <Film size={24} className="text-purple-400 mb-1" />
                        <span className="text-[10px] text-gray-400 truncate max-w-full px-2">{r.filename}</span>
                      </div>
                    ) : r.filename.match(/\.(mp3|wav|ogg|m4a|aac|flac|aiff|weba)$/i) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <Music size={24} className="text-green-400 mb-1" />
                        <span className="text-[10px] text-gray-400 truncate max-w-full px-2">{r.filename}</span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <FileText size={24} className="text-orange-400 mb-1" />
                        <span className="text-[10px] text-gray-400 truncate max-w-full px-2">{r.filename}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Error items */}
            {results.filter((r) => r.error).map((r, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-xl border bg-red-500/5 border-red-500/20"
              >
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{r.filename}</p>
                  <p className="text-xs text-red-400">{r.error}</p>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => { setResults([]); }}
              className="w-full mt-3 py-2.5 bg-white/5 text-white/70 rounded-xl text-sm hover:bg-white/10 transition-colors"
            >
              Upload More Files
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600 mt-12">
          Files are securely uploaded and accessible only by your account manager.
        </p>
      </div>
    </div>
  );
}
