import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - Kikstshop",
  description: "Masuk ke akun Kikstshop Anda",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
