"use client";
import { getInitials } from "@/lib/utils";

interface UserAvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  ring?: boolean;
}

export function UserAvatar({ src, name, size = "md", ring = false }: UserAvatarProps) {
  const sizeClass = size === "md" ? "avatar" : `avatar avatar-${size}`;
  const initials = getInitials(name || "U");

  const avatar = (
    <div className={sizeClass}>
      {src ? (
        <img src={src} alt={name} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        initials
      )}
    </div>
  );

  if (ring) {
    return <div className="avatar-ring">{avatar}</div>;
  }
  return avatar;
}
