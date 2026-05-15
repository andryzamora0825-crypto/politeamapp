import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Navbar } from "@/components/Navbar";
import { ProfilePage } from "@/components/ProfilePage";
import { MobileNav } from "@/components/MobileNav";

export default async function PerfilPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const user = await currentUser();
  const supabase = await createClient();

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile) {
    const { data: newProfile } = await supabase
      .from("profiles")
      .insert({
        clerk_user_id: userId,
        username: user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "usuario",
        full_name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Usuario",
        avatar_url: user?.imageUrl || "",
      })
      .select()
      .single();
    profile = newProfile;
  }

  return (
    <>
      <Navbar profile={profile} />
      <ProfilePage profile={profile} currentUserId={userId} />
      <MobileNav profile={profile} />
    </>
  );
}
