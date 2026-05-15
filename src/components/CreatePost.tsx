"use client";
import { useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";

interface CreatePostProps {
  currentUserId: string;
  profile: any;
  onNewPost: (post: any) => void;
}

export function CreatePost({ currentUserId, profile, onNewPost }: CreatePostProps) {
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!content.trim() && !imageFile) return;
    setLoading(true);
    setError(null);

    let image_url = null;

    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${currentUserId}/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(fileName, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Error subiendo imagen:", uploadError);
        setError("Error al subir la imagen. Verifica las politicas del bucket en Supabase Storage.");
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("post-images")
        .getPublicUrl(fileName);
      image_url = urlData.publicUrl;
    }

    const { data, error: insertError } = await supabase
      .from("posts")
      .insert({ author_id: currentUserId, content: content.trim(), image_url })
      .select()
      .single();

    if (insertError) {
      console.error("Error creando post:", insertError);
      setError("Error al publicar: " + insertError.message);
    } else if (data) {
      onNewPost(data);
      setContent("");
      removeImage();
    }
    setLoading(false);
  };

  return (
    <div className="card create-post">
      <div className="create-post-top">
        <UserAvatar src={profile?.avatar_url} name={profile?.full_name || "U"} />
        <textarea
          className="create-post-input"
          placeholder={`¿Qué estás pensando, ${profile?.full_name?.split(" ")[0] || ""}?`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={1}
        />
      </div>
      {imagePreview && (
        <div className="image-preview">
          <img src={imagePreview} alt="Preview" />
          <button className="image-preview-remove" onClick={removeImage}>✕</button>
        </div>
      )}
      {error && (
        <div style={{ padding: "8px 12px", margin: "8px 0", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: "0.8rem" }}>
          {error}
        </div>
      )}
      <div className="create-post-actions">
        <div className="create-post-tools">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImageSelect} />
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Foto
          </button>
        </div>
        <button
          className={`btn btn-primary btn-sm ${loading || (!content.trim() && !imageFile) ? "btn-disabled" : ""}`}
          onClick={handleSubmit}
        >
          {loading ? "Publicando..." : "Publicar"}
        </button>
      </div>
    </div>
  );
}
