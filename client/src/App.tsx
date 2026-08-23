import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import LocalizationUploadPage from "./pages/LocalizationUploadPage";
import ProjectsPage from "./pages/ProjectsPage";
import LocalizationProjectPage from "./pages/LocalizationProjectPage";
import DashboardLayout from "./components/DashboardLayout";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/upload"} component={LocalizationUploadPage} />
        <Route path={"/projects"} component={ProjectsPage} />
        <Route path={"/projects/:projectId"} component={LocalizationProjectPage} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
