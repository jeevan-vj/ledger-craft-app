import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "@/hooks/use-toast";
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import CreateInvoice from "./pages/CreateInvoice";
import EditInvoice from "./pages/EditInvoice";
import Customers from "./pages/Customers";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Items from "./pages/Items";
import InvoiceViewPage from "./pages/InvoiceViewPage";
import Accounts from "./pages/Accounts";
import PublicInvoice from "./pages/PublicInvoice";
import Categories from "./pages/Categories";
import CustomerManagement from "./pages/CustomerManagement";
import ItemManagement from "./pages/ItemManagement";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <AppLayout><Dashboard /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/invoices" element={
                  <ProtectedRoute>
                    <AppLayout><Invoices /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/invoices/new" element={
                  <ProtectedRoute>
                    <AppLayout><CreateInvoice /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/invoices/:id/edit" element={
                  <ProtectedRoute>
                    <AppLayout><EditInvoice /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/invoices/:id" element={
                  <ProtectedRoute>
                    <AppLayout><InvoiceViewPage /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/public/invoice/:id" element={<PublicInvoice />} />
                <Route path="/customers" element={
                  <ProtectedRoute>
                    <AppLayout><Customers /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/customers/new" element={
                  <ProtectedRoute>
                    <AppLayout><CustomerManagement /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/customers/:id/edit" element={
                  <ProtectedRoute>
                    <AppLayout><CustomerManagement /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/items" element={
                  <ProtectedRoute>
                    <AppLayout><Items /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/items/new" element={
                  <ProtectedRoute>
                    <AppLayout><ItemManagement /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/items/:id/edit" element={
                  <ProtectedRoute>
                    <AppLayout><ItemManagement /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/categories" element={
                  <ProtectedRoute>
                    <AppLayout><Categories /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/accounts" element={
                  <ProtectedRoute>
                    <AppLayout><Accounts /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <AppLayout><Settings /></AppLayout>
                  </ProtectedRoute>
                } />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </AppProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
