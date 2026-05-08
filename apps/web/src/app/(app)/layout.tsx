import type { ReactNode } from "react";

import Header from "@/components/header";

const AppLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex h-dvh flex-col">
    <Header />

    {children}
  </div>
);

export default AppLayout;
