"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export default function Home() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push("/sign-in");
    } else {
      router.push("/chat");
    }
  }, [user, router]);

  return null; // No need to render anything as the user will be redirected
}
