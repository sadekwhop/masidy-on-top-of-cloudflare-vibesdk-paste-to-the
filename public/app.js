import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Sparkles, Wand2, Rocket, LayoutDashboard, CreditCard, Globe,
  ShieldCheck, CheckCircle2, AlertCircle, Settings, HelpCircle,
  Send, RefreshCw, Zap, Check, ExternalLink, Lock, Plus, Trash2,
  Copy, ChevronRight, ChevronLeft, User, Code, Eye, Menu, X,
  Shield, FileText, Flag, MessageSquare, Monitor, Smartphone, Tablet
} from "lucide-react";

// Idea Chips Data (real prompts)
const IDEA_CHIPS = [
  { id: 1, text: "متجر ملابس إلكتروني متكامل مع سلة وسداد", category: "تجارة إلكترونية" },
  { id: 2, text: "موقع شركة مقاولات واستشارات هندسية", category: "أعمال" },
  { id: 3, text: "منصة دورات تعليمية أونلاين مع باقات اشتراك", category: "تعليم" },
  { id: 4, text: "لوحة تحكم لإدارة المبيعات والمهام اليومية", category: "لوحة تحكم" },
  { id: 5, text: "صفحة هبوط لتطبيق توصيل مع نموذج حجز", category: "تطبيق هاتف" }
];

export function MasidyApp() {
  // Navigation & User State
  const [user, setUser] = useState({ id: "usr_admin_default", email: "demo@masidy.app", name: "مستخدم مسيدي", credits: 50, role: "admin" });
  const [activeTab, setActiveTab] = useState("home"); // home | workspace | dashboard | billing | admin
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // App Prompt & Plan State
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [editPrompt, setEditPrompt] = useState("");

  // Workspace View State
  const [previewDevice, setPreviewDevice] = useState("desktop"); // desktop | tablet | mobile
  const [viewMode, setViewMode] = useState("preview"); // preview | code
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [customDomainData, setCustomDomainData] = useState(null);

  // Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [showReportAbuseModal, setShowReportAbuseModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // User projects list
  const [projectsList, setProjectsList] = useState([]);
  const [billingData, setBillingData] = useState({ ledger: [] });
  const [adminOverview, setAdminOverview] = useState({ users: [], projects: [], ledger: [] });

  useEffect(() => {
    fetchUserData();
    fetchProjects();
  }, []);

  const showToast = (msg, type = "info") => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchUserData = async () => {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) setUser(data.user);
      } else {
        // Auto demo login for smooth experience
        const loginRes = await fetch("/api/auth/demo-login", { method: "POST" });
        if (loginRes.ok) {
          const lData = await loginRes.json();
          setUser({ id: lData.user_id, email: "demo@masidy.app", name: "مستخدم مسيدي", credits: 50, role: "user" });
        }
      }
    } catch (e) {
      console.warn("User fetch fallback", e);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjectsList(data.projects || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.ok) {
        const data = await res.json();
        setBillingData(data);
        setUser(prev => ({ ...prev, credits: data.credits }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAdminData = async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (res.ok) {
        const data = await res.json();
        setAdminOverview(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Step 2: Plan-Then-Approve Trigger
  const handleGeneratePlan = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      showToast("يرجى كتابة فكرة التطبيق أو اختيار فكرة مقترحة أولاً", "error");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/projects/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "حدث خطأ أثناء صياغة الخطة", "error");
        setIsLoading(false);
        return;
      }

      setActivePlan(data.plan);
      setCurrentProject({ id: data.project_id, name: data.plan.title, slug: data.plan.slug });
      setShowPlanModal(true);
    } catch (e) {
      showToast("عذراً، فشل الاتصال بالخادم", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 & 4: Approve Plan and Deduct 10 Credits
  const handleApproveAndBuild = async () => {
    if (!currentProject) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/approve-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();

      if (res.status === 402) {
        showToast(data.error || "رصيدك الحالي غير كافٍ. يرجى شحن الرصيد أولاً", "error");
        setShowPlanModal(false);
        setShowBillingModal(true);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        showToast(data.error || "فشل تنفيذ البناء", "error");
        setIsLoading(false);
        return;
      }

      // Success
      setUser(prev => ({ ...prev, credits: data.remaining_credits }));
      setCurrentProject(prev => ({ ...prev, code: data.code, status: "ready" }));
      setShowPlanModal(false);
      setActiveTab("workspace");
      showToast("تم خصم 10 نقاط وبناء التطبيق بنجاح! ✨", "success");
      fetchProjects();
    } catch (e) {
      showToast("خطأ أثناء معالجة الطلب", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Conversational Edit (Cost 3 credits)
  const handleApplyEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editPrompt.trim() || !currentProject) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: editPrompt })
      });
      const data = await res.json();

      if (res.status === 402) {
        showToast(data.error || "رصيدك غير كافٍ لتعديل المشروع (يتطلب 3 رصيد)", "error");
        setShowBillingModal(true);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        showToast(data.error || "فشل التعديل", "error");
        setIsLoading(false);
        return;
      }

      setUser(prev => ({ ...prev, credits: data.remaining_credits }));
      setCurrentProject(prev => ({ ...prev, code: data.code }));
      setEditPrompt("");
      showToast("تم تطبيق التعديلات بنجاح! (تم خصم 3 رصيد)", "success");
    } catch (e) {
      showToast("خطأ في الاتصال", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Publish to <slug>.masidy.app
  const handlePublishProject = async () => {
    if (!currentProject) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: currentProject.slug })
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "فشل النشر", "error");
        setIsLoading(false);
        return;
      }

      setCurrentProject(prev => ({ ...prev, status: "published", published_url: data.published_url }));
      showToast(`مبروك! تم نشر موقعك بنجاح على: ${data.published_url}`, "success");
      fetchProjects();
    } catch (e) {
      showToast("خطأ أثناء النشر", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Save Custom Domain
  const handleAddCustomDomain = async (e) => {
    if (e) e.preventDefault();
    if (!customDomainInput.trim() || !currentProject) return;

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: customDomainInput })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "فشل إضافة النطاق الخاص", "error");
        return;
      }

      setCustomDomainData(data);
      showToast("تم حفظ النطاق بنجاح، يرجى ضبط سجلات الـ DNS أدناه", "success");
    } catch (e) {
      showToast("خطأ في الاتصال", "error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-bg text-ink">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 left-5 z-[100] max-w-md px-5 py-3.5 rounded-2xl shadow-xl border flex items-center gap-3 backdrop-blur-md transition-all ${
          toastMessage.type === "error" ? "bg-red-50/95 border-red-200 text-red-900" :
          toastMessage.type === "success" ? "bg-emerald-50/95 border-emerald-200 text-emerald-900" :
          "bg-white/95 border-line text-ink"
        }`}>
          {toastMessage.type === "error" ? <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" /> :
           toastMessage.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> :
           <Sparkles className="w-5 h-5 text-brand flex-shrink-0" />}
          <div className="text-sm font-medium">{toastMessage.msg}</div>
        </div>
      )}

      {/* Top Navbar Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-line shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab("home")}>
            <img src="/masidy-logo.svg" alt="مسيدي" className="w-9 h-9 shadow-sm rounded-xl" />
            <div className="flex flex-col">
              <span className="font-bold text-lg text-ink tracking-tight">مسيدي <span className="text-xs text-brand font-mono font-normal">/ Masidy</span></span>
              <span className="text-[10px] text-muted -mt-1 hidden sm:inline">منصة بناء المواقع والتطبيقات بالذكاء الاصطناعي</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-muted">
            <button
              onClick={() => setActiveTab("home")}
              className={`px-3 py-1.5 rounded-lg transition ${activeTab === "home" ? "bg-brand-light text-brand font-semibold" : "hover:text-ink"}`}>
              الرئيسية
            </button>
            <button
              onClick={() => { setActiveTab("dashboard"); fetchProjects(); }}
              className={`px-3 py-1.5 rounded-lg transition ${activeTab === "dashboard" ? "bg-brand-light text-brand font-semibold" : "hover:text-ink"}`}>
              مشاريعي
            </button>
            <button
              onClick={() => { setShowBillingModal(true); fetchBilling(); }}
              className="px-3 py-1.5 rounded-lg transition hover:text-ink">
              الأسعار والباقات
            </button>
            {user.role === "admin" && (
              <button
                onClick={() => { setShowAdminModal(true); fetchAdminData(); }}
                className="px-3 py-1.5 rounded-lg transition text-purple-600 hover:bg-purple-50 font-semibold">
                لوحة المسئول 🛡️
              </button>
            )}
          </nav>

          {/* Credits Counter Badge & Actions */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => { setShowBillingModal(true); fetchBilling(); }}
              className="pulse-glow cursor-pointer bg-gradient-to-r from-brand-light to-blue-50 border border-brand/20 px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold text-brand hover:scale-105 transition shadow-sm">
              <Zap className="w-4 h-4 fill-brand text-brand" />
              <span>{user.credits} رصيد</span>
              <span className="text-[10px] bg-brand text-white px-1.5 py-0.5 rounded-full font-normal">+ شحن</span>
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg border border-line text-muted hover:text-ink">
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Nav */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-line bg-white px-4 py-3 space-y-2 text-sm font-medium">
            <button
              onClick={() => { setActiveTab("home"); setIsMobileMenuOpen(false); }}
              className="block w-full text-right px-3 py-2 rounded-lg hover:bg-bg">
              الرئيسية
            </button>
            <button
              onClick={() => { setActiveTab("dashboard"); fetchProjects(); setIsMobileMenuOpen(false); }}
              className="block w-full text-right px-3 py-2 rounded-lg hover:bg-bg">
              مشاريعي
            </button>
            <button
              onClick={() => { setShowBillingModal(true); fetchBilling(); setIsMobileMenuOpen(false); }}
              className="block w-full text-right px-3 py-2 rounded-lg hover:bg-bg">
              الأسعار والرصيد
            </button>
            {user.role === "admin" && (
              <button
                onClick={() => { setShowAdminModal(true); fetchAdminData(); setIsMobileMenuOpen(false); }}
                className="block w-full text-right px-3 py-2 rounded-lg text-purple-600 bg-purple-50">
                لوحة الإدارة والتحكم
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main View Router */}
      <main className="flex-1 relative z-10">
        
        {/* ========================================================= */}
        {/* TAB 1: LANDING & PROMPT BUILDER */}
        {/* ========================================================= */}
        {activeTab === "home" && (
          <div>
            {/* Slow Drifting Pastel Ambient Blobs Background */}
            <div className="ambient-gradient-container">
              <div className="blob blob-1"></div>
              <div className="blob blob-2"></div>
              <div className="blob blob-3"></div>
              <div className="blob blob-4"></div>
            </div>

            {/* Hero Section */}
            <section className="relative pt-12 pb-16 px-4 sm:px-6 max-w-5xl mx-auto text-center space-y-8">
              
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-line shadow-sm backdrop-blur-md text-xs font-semibold text-brand">
                <Sparkles className="w-4 h-4 text-brand animate-spin" />
                <span>الجيل الجديد من الذكاء الاصطناعي لبناء المواقع باللغة العربية</span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-ink leading-tight tracking-tight max-w-4xl mx-auto">
                حّول فكرتك إلى موقع أو تطبيق تفاعلي <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand via-purple-600 to-blue-500">في ثوانٍ معدودة</span>
              </h1>

              <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto leading-relaxed">
                اكتب ما بذهنك بالعربية. سيقوم مسيدي بإعداد خطة عمل دقيقة، واجهات ممتازة، ونشرها بنقرة واحدة على نطاقك الخاص.
              </p>

              {/* Prompt Box with Sweeping Conic Border Sweep Light Effect */}
              <div className="max-w-3xl mx-auto pt-2">
                <div className="glowing-border-wrap">
                  <div className="glowing-border-inner p-3 sm:p-4">
                    <form onSubmit={handleGeneratePlan} className="space-y-3">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="اكتب فكرة موقعك أو تطبيقك هنا... (مثال: متجر إلكتروني للملابس العربية مع سلة وسداد ومراجعات)"
                        rows={3}
                        className="w-full p-3 text-base text-ink placeholder-muted bg-transparent border-0 focus:ring-0 resize-none outline-none font-sans"
                      />
                      
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line/60 pt-3">
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>خطة عمل مجانية للمعاينة قبل الخصم</span>
                        </div>

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="w-full sm:w-auto bg-brand hover:bg-brand-hover text-white font-bold px-6 py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50">
                          {isLoading ? (
                            <>
                              <RefreshCw className="w-5 h-5 animate-spin" />
                              <span>جاري إعداد الخطة...</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-5 h-5" />
                              <span>أنشئ خطة العمل الآن</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Idea Chips Section (Click to fill) */}
              <div className="pt-6 max-w-3xl mx-auto space-y-3 text-right">
                <div className="text-xs font-semibold text-muted flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  <span>أفكار واقتراحات سريعة (انقر لتجربة النص):</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {IDEA_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setPrompt(chip.text)}
                      className="bg-white/90 hover:bg-brand-light hover:text-brand border border-line text-ink text-xs font-medium px-3.5 py-2 rounded-xl transition shadow-2xs flex items-center gap-1.5">
                      <span>{chip.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Features & Value Grid */}
            <section className="py-16 bg-white border-t border-line px-4 sm:px-6">
              <div className="max-w-6xl mx-auto space-y-12">
                <div className="text-center space-y-3">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-ink">لماذا يختار المحترفون منصة مسيدي؟</h2>
                  <p className="text-muted max-w-xl mx-auto">منصة متكاملة صُممت خصيصاً للمستخدم العربي لتقديم أسرع تجربة بناء جودة ممتازة.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                  <div className="p-6 rounded-2xl border border-line bg-bg space-y-3 hover:border-brand/40 transition">
                    <div className="w-12 h-12 rounded-xl bg-brand-light text-brand flex items-center justify-center font-bold text-xl">
                      <LayoutDashboard className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg text-ink">خطة عمل ذكية ثم موافقة</h3>
                    <p className="text-sm text-muted leading-relaxed">
                      الوكيل يصيغ لك خطة هيكلية شاملة للصفحات والمزايا بلغة عربية واضحة لتراجعها وتعدلها قبل أن تبدأ عملية التوليد.
                    </p>
                  </div>

                  <div className="p-6 rounded-2xl border border-line bg-bg space-y-3 hover:border-brand/40 transition">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xl">
                      <Globe className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg text-ink">دعم كامل للغة العربية RTL</h3>
                    <p className="text-sm text-muted leading-relaxed">
                      دقة متناهية في الاتجاه من اليمين لليسار، خط IBM Plex Sans Arabic الأصلي، وتجاوب تام مع كافة الشاشات.
                    </p>
                  </div>

                  <div className="p-6 rounded-2xl border border-line bg-bg space-y-3 hover:border-brand/40 transition">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl">
                      <Rocket className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg text-ink">نشر فورى ودومينات خاصة</h3>
                    <p className="text-sm text-muted leading-relaxed">
                      انشر تطبيقك فوراً على رابط مجاني &lt;slug&gt;.masidy.app أو ربطه بنطاقك الخاص مع شهادة SSL تلقائية.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Pricing Section */}
            <section className="py-16 bg-bg border-t border-line px-4 sm:px-6">
              <div className="max-w-6xl mx-auto space-y-10">
                <div className="text-center space-y-3">
                  <h2 className="text-2xl sm:text-3xl font-extrabold">باقات الرصيد الشفافة</h2>
                  <p className="text-muted">جديدة؟ احصل على 50 رصيد مجاني عند التسجيل. ادفع فقط مقابل ما تستخدمه.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Pack 100 */}
                  <div className="bg-white border border-line rounded-2xl p-6 space-y-6 flex flex-col justify-between hover:shadow-md transition">
                    <div className="space-y-4">
                      <span className="text-xs font-bold text-muted uppercase">الباقة الأساسية</span>
                      <h3 className="text-2xl font-extrabold">100 رصيد</h3>
                      <div className="text-3xl font-extrabold text-brand">$10 <span className="text-xs font-normal text-muted">/ ~500 ج.م</span></div>
                      <p className="text-xs text-muted">تيكفي لبناء 10 تطبيقات جديدة أو إجراء 30+ تعديل مباشر.</p>
                    </div>
                    <button
                      onClick={() => { setShowBillingModal(true); fetchBilling(); }}
                      className="w-full bg-bg hover:bg-brand hover:text-white border border-line text-ink font-semibold py-2.5 rounded-xl transition">
                      شراء الرصيد
                    </button>
                  </div>

                  {/* Pack 500 Popular */}
                  <div className="bg-white border-2 border-brand rounded-2xl p-6 space-y-6 flex flex-col justify-between shadow-lg relative">
                    <div className="absolute -top-3 right-6 bg-brand text-white text-[10px] font-extrabold px-3 py-1 rounded-full">
                      الأكثر شعبية ✨
                    </div>
                    <div className="space-y-4">
                      <span className="text-xs font-bold text-brand uppercase">الباقة الاحترافية</span>
                      <h3 className="text-2xl font-extrabold">500 رصيد</h3>
                      <div className="text-3xl font-extrabold text-brand">$40 <span className="text-xs font-normal text-muted">/ ~2000 ج.م</span></div>
                      <p className="text-xs text-muted">مثالية للمشروعات المتعددة والشركات الناشئة والمطورين.</p>
                    </div>
                    <button
                      onClick={() => { setShowBillingModal(true); fetchBilling(); }}
                      className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-xl transition shadow-md">
                      اشترك الآن
                    </button>
                  </div>

                  {/* Pack 2000 Pro */}
                  <div className="bg-white border border-line rounded-2xl p-6 space-y-6 flex flex-col justify-between hover:shadow-md transition">
                    <div className="space-y-4">
                      <span className="text-xs font-bold text-muted uppercase">باقة الأعمال</span>
                      <h3 className="text-2xl font-extrabold">2000 رصيد</h3>
                      <div className="text-3xl font-extrabold text-brand">$120 <span className="text-xs font-normal text-muted">/ ~6000 ج.م</span></div>
                      <p className="text-xs text-muted">أعلى قيمة للوكالات وأصحاب الأعمال الكبيرة.</p>
                    </div>
                    <button
                      onClick={() => { setShowBillingModal(true); fetchBilling(); }}
                      className="w-full bg-bg hover:bg-brand hover:text-white border border-line text-ink font-semibold py-2.5 rounded-xl transition">
                      تواصل معنا
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: LIVE WORKSPACE & PREVIEW EDITOR */}
        {/* ========================================================= */}
        {activeTab === "workspace" && currentProject && (
          <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row overflow-hidden bg-white">
            
            {/* Sidebar / Chat Panel */}
            <div className="w-full md:w-96 border-b md:border-b-0 md:border-l border-line flex flex-col bg-bg h-1/2 md:h-full">
              
              {/* Project Title Bar */}
              <div className="p-4 border-b border-line bg-white flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base text-ink">{currentProject.name}</h2>
                  <a
                    href={currentProject.published_url || `/site/${currentProject.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:underline flex items-center gap-1 mt-0.5">
                    <span>{currentProject.slug}.masidy.app</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDomainModal(true)}
                    className="p-2 rounded-lg border border-line text-muted hover:text-ink hover:bg-bg text-xs flex items-center gap-1">
                    <Globe className="w-4 h-4 text-brand" />
                    <span className="hidden sm:inline">نطاق خاص</span>
                  </button>
                  <button
                    onClick={handlePublishProject}
                    disabled={isLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition">
                    <Rocket className="w-3.5 h-3.5" />
                    <span>نشر</span>
                  </button>
                </div>
              </div>

              {/* Chat Edit Form */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                <div className="bg-white p-3.5 rounded-2xl border border-line space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-brand" /> طلب تعديل حي</span>
                    <span className="text-brand font-bold">التكلفة: 3 رصيد</span>
                  </div>
                  <form onSubmit={handleApplyEdit} className="space-y-2">
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="اطلب أي تعديل (مثال: غير لون الأزرار للأحمر، أضف قسم الخريطة)..."
                      rows={3}
                      className="w-full p-2.5 text-sm border border-line rounded-xl bg-bg focus:ring-1 focus:ring-brand outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !editPrompt.trim()}
                      className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-bold py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50">
                      {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>تطبيق التعديل (3 نقاط)</span>
                    </button>
                  </form>
                </div>

                {/* Project Metadata info */}
                <div className="bg-white p-3.5 rounded-2xl border border-line space-y-2 text-xs text-muted">
                  <div className="font-bold text-ink mb-1">تفاصيل المشروع:</div>
                  <div className="flex justify-between"><span>الحالة:</span> <span className="font-bold text-emerald-600">{currentProject.status}</span></div>
                  <div className="flex justify-between"><span>الرابط:</span> <span className="font-mono">{currentProject.slug}</span></div>
                  <div className="flex justify-between"><span>رصيدك الحالي:</span> <span className="font-bold text-brand">{user.credits} نقطة</span></div>
                </div>
              </div>
            </div>

            {/* Main Preview Area */}
            <div className="flex-1 flex flex-col h-1/2 md:h-full bg-slate-100">
              
              {/* Toolbar */}
              <div className="h-12 bg-white border-b border-line px-4 flex items-center justify-between">
                
                {/* Devices switcher */}
                <div className="flex items-center gap-1 bg-bg p-1 rounded-lg border border-line">
                  <button
                    onClick={() => setPreviewDevice("desktop")}
                    className={`p-1.5 rounded-md transition ${previewDevice === "desktop" ? "bg-white shadow-2xs text-brand" : "text-muted"}`}>
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewDevice("tablet")}
                    className={`p-1.5 rounded-md transition ${previewDevice === "tablet" ? "bg-white shadow-2xs text-brand" : "text-muted"}`}>
                    <Tablet className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewDevice("mobile")}
                    className={`p-1.5 rounded-md transition ${previewDevice === "mobile" ? "bg-white shadow-2xs text-brand" : "text-muted"}`}>
                    <Smartphone className="w-4 h-4" />
                  </button>
                </div>

                {/* Preview vs Code tab */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${viewMode === "preview" ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>
                    <Eye className="w-3.5 h-3.5" />
                    <span>المعاينة</span>
                  </button>
                  <button
                    onClick={() => setViewMode("code")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${viewMode === "code" ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>
                    <Code className="w-3.5 h-3.5" />
                    <span>الكود</span>
                  </button>
                </div>
              </div>

              {/* View Container */}
              <div className="flex-1 p-4 flex justify-center items-center overflow-auto">
                {viewMode === "preview" ? (
                  <div className={`h-full bg-white rounded-xl shadow-lg border border-line overflow-hidden transition-all duration-300 ${
                    previewDevice === "mobile" ? "w-[375px]" :
                    previewDevice === "tablet" ? "w-[768px]" :
                    "w-full"
                  }`}>
                    <iframe
                      title="المعاينة الحية"
                      srcDoc={currentProject.code || "<html><body><h1>جاري تجهيز المعاينة...</h1></body></html>"}
                      className="w-full h-full border-0"
                    />
                  </div>
                ) : (
                  <pre className="w-full h-full bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto text-xs font-mono border border-slate-800">
                    {currentProject.code}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: DASHBOARD */}
        {/* ========================================================= */}
        {activeTab === "dashboard" && (
          <div className="max-w-6xl mx-auto py-10 px-4 sm:px-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">لوحة مشاريعي</h1>
                <p className="text-sm text-muted">إدارة وتعديل جميع مواقعك المنشورة عبر مسيدي</p>
              </div>
              <button
                onClick={() => setActiveTab("home")}
                className="bg-brand text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 shadow-sm">
                <Plus className="w-4 h-4" />
                <span>مشروع جديد</span>
              </button>
            </div>

            {projectsList.length === 0 ? (
              <div className="bg-white border border-line rounded-2xl p-12 text-center space-y-4">
                <LayoutDashboard className="w-12 h-12 text-muted mx-auto" />
                <h3 className="font-bold text-lg">لا يوجد مشاريع حتى الآن</h3>
                <p className="text-sm text-muted">ابدأ بكتابة فكرتك في الصفحة الرئيسية لإنشاء مشروعك الأول.</p>
                <button
                  onClick={() => setActiveTab("home")}
                  className="bg-brand text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-block">
                  أنشئ أول موقع لك
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projectsList.map((p) => (
                  <div key={p.id} className="bg-white border border-line rounded-2xl p-5 space-y-4 hover:shadow-md transition">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-base text-ink">{p.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === "published" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                      }`}>
                        {p.status}
                      </span>
                    </div>

                    <div className="text-xs text-muted font-mono bg-bg p-2 rounded-lg border border-line/60">
                      {p.slug}.masidy.app
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-line">
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/projects/${p.id}`);
                          if (res.ok) {
                            const data = await res.json();
                            setCurrentProject(data.project);
                            setActiveTab("workspace");
                          }
                        }}
                        className="flex-1 bg-brand-light text-brand font-semibold py-2 rounded-lg text-xs hover:bg-brand hover:text-white transition">
                        فتح في بيئة العمل
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* MODAL 1: PLAN-THEN-APPROVE GATE (Step 2) */}
      {/* ========================================================= */}
      {showPlanModal && activePlan && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-line max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2 text-brand font-bold text-lg">
                <Sparkles className="w-5 h-5" />
                <span>خطة العمل المقترحة لتطبيقك</span>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Plan Details */}
            <div className="space-y-4 text-sm">
              <div className="bg-bg p-4 rounded-2xl border border-line space-y-1">
                <div className="font-extrabold text-base text-ink">{activePlan.title}</div>
                <div className="text-xs text-muted">الرابط المقترح: <span className="font-mono text-brand font-bold">{activePlan.slug}.masidy.app</span></div>
                <p className="text-muted pt-2">{activePlan.summary}</p>
              </div>

              {/* Pages */}
              <div className="space-y-2">
                <div className="font-bold text-ink">الصفحات المخطط إنشاؤها:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activePlan.pages?.map((page, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl border border-line bg-white flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-xs">{page.name}</div>
                        <div className="text-[11px] text-muted">{page.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2">
                <div className="font-bold text-ink">المزايا المضمنة:</div>
                <ul className="space-y-1 text-xs text-muted list-disc list-inside">
                  {activePlan.features?.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-line">
              <div className="text-xs text-muted">
                تكلفة الخطة والبناء: <strong className="text-brand font-extrabold">10 رصيد</strong> (رصيدك: {user.credits})
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 sm:flex-none border border-line px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-bg transition">
                  عدّل الخطة
                </button>
                <button
                  onClick={handleApproveAndBuild}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none bg-brand hover:bg-brand-hover text-white text-xs font-extrabold px-6 py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-1.5">
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  <span>وافق وابني</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: BILLING & CREDITS MODAL (Step 4) */}
      {/* ========================================================= */}
      {showBillingModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-line max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2 font-bold text-lg text-ink">
                <CreditCard className="w-5 h-5 text-brand" />
                <span>إدارة الرصيد وشراء الباقات</span>
              </div>
              <button onClick={() => setShowBillingModal(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Balance Card */}
            <div className="bg-gradient-to-r from-brand to-purple-600 text-white p-6 rounded-2xl space-y-2 shadow-md">
              <div className="text-xs opacity-90">رصيدك الحالي المتاح:</div>
              <div className="text-4xl font-extrabold">{user.credits} <span className="text-base font-normal">رصيد</span></div>
              <p className="text-xs opacity-80 pt-1">يُخصم 10 نقاط لبناء تطبيق جديد بالكامل، و 3 نقاط لكل طلب تعديل تفاعلي.</p>
            </div>

            {/* Packs Selection */}
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-ink">اختر باقة الرصيد المناسبة:</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {billingData.packs?.map((pack) => (
                  <div key={pack.id} className="border border-line rounded-2xl p-4 space-y-3 hover:border-brand transition">
                    <div className="font-bold text-sm">{pack.label_ar}</div>
                    <div className="text-2xl font-extrabold text-brand">${pack.price_usd}</div>
                    <div className="text-[11px] text-muted">~{pack.price_egp} جنيه مصري</div>
                    <button
                      onClick={async () => {
                        const res = await fetch("/api/webhooks/paymob", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ success: true, user_id: user.id })
                        });
                        if (res.ok) {
                          showToast("تمت معالجة العملية وإضافة الرصيد بنجاح! 🎉", "success");
                          fetchBilling();
                        }
                      }}
                      className="w-full bg-brand text-white text-xs font-bold py-2 rounded-xl hover:bg-brand-hover transition">
                      ادفع عبر Paymob / Stripe
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Ledger History */}
            <div className="space-y-3 pt-4 border-t border-line">
              <h4 className="font-bold text-sm text-ink">سجل العمليات الأخير:</h4>
              <div className="max-h-48 overflow-y-auto space-y-2 text-xs">
                {billingData.ledger?.map((item) => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-bg border border-line/60 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-ink">{item.reason}</div>
                      <div className="text-[10px] text-muted">{new Date(item.created_at).toLocaleString("ar-EG")}</div>
                    </div>
                    <div className={`font-bold ${item.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {item.amount > 0 ? `+${item.amount}` : item.amount} رصيد
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: CUSTOM DOMAIN DRAWER (Step 6) */}
      {/* ========================================================= */}
      {showDomainModal && currentProject && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-line">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2 font-bold text-ink">
                <Globe className="w-5 h-5 text-brand" />
                <span>ربط نطاق خاص (Custom Domain)</span>
              </div>
              <button onClick={() => setShowDomainModal(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomDomain} className="space-y-3">
              <label className="block text-xs font-semibold text-muted">أدخل اسم النطاق الخاص بك:</label>
              <input
                type="text"
                value={customDomainInput}
                onChange={(e) => setCustomDomainInput(e.target.value)}
                placeholder="مثال: mysite.com"
                className="w-full p-3 border border-line rounded-xl text-sm outline-none focus:ring-1 focus:ring-brand font-mono"
              />
              <button
                type="submit"
                className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-bold py-2.5 rounded-xl transition">
                حفظ وحساب سجلات DNS
              </button>
            </form>

            {customDomainData && (
              <div className="bg-bg p-4 rounded-2xl border border-line space-y-3 text-xs">
                <div className="font-bold text-ink">سجلات الـ DNS المطلوبة في مزود نطاقك:</div>
                {customDomainData.dns_records?.map((rec, i) => (
                  <div key={i} className="p-2 bg-white rounded-lg border border-line space-y-1 font-mono">
                    <div className="flex justify-between text-muted"><span>نوع: {rec.type}</span> <span>{rec.status}</span></div>
                    <div className="text-ink font-bold">{rec.name} ➔ {rec.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: ADMIN MANAGEMENT PANEL (Step 5) */}
      {/* ========================================================= */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-line max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2 font-bold text-lg text-purple-700">
                <Shield className="w-5 h-5" />
                <span>لوحة التحكم والمسئول الرئيسي 🛡️</span>
              </div>
              <button onClick={() => setShowAdminModal(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Admin Overview Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-purple-50 border border-purple-100 p-4 rounded-2xl">
                <div className="text-xs text-purple-600 font-semibold">إجمالي المستخدمين:</div>
                <div className="text-2xl font-extrabold text-purple-900">{adminOverview.users?.length || 0}</div>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                <div className="text-xs text-blue-600 font-semibold">إجمالي المشروعات:</div>
                <div className="text-2xl font-extrabold text-blue-900">{adminOverview.projects?.length || 0}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
                <div className="text-xs text-emerald-600 font-semibold">المفعلين والمنشورين:</div>
                <div className="text-2xl font-extrabold text-emerald-900">
                  {adminOverview.projects?.filter(p => p.status === "published").length || 0}
                </div>
              </div>
            </div>

            {/* System Projects List */}
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-ink">جميع مشروعات النظام (مع مفتاح إيقاف الفوري):</h4>
              <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
                {adminOverview.projects?.map((p) => (
                  <div key={p.id} className="p-3 bg-bg rounded-xl border border-line flex items-center justify-between">
                    <div>
                      <div className="font-bold text-ink">{p.name} <span className="text-[10px] text-muted">({p.slug})</span></div>
                      <div className="text-[10px] text-muted">المستخدم: {p.user_id}</div>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/admin/projects/${p.id}/kill`, { method: "POST" });
                        if (res.ok) {
                          showToast("تم حظر وإلغاء نشر التطبيق فورا", "success");
                          fetchAdminData();
                        }
                      }}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-[11px] hover:bg-red-700 transition">
                      حظر وإلغاء النشر
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-line py-12 px-4 sm:px-6 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <img src="/masidy-logo.svg" alt="مسيدي" className="w-7 h-7" />
              <span className="font-bold text-base text-ink">مسيدي / Masidy</span>
            </div>
            <p className="text-xs text-muted max-w-sm leading-relaxed">
              منصة بناء مواقع وتطبيقات بالذكاء الاصطناعي معالجة باللغة العربية. بنية تحتية سحابية فائقة الأمان والسرعة.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-xs text-ink uppercase">المنصة</div>
            <ul className="space-y-1.5 text-xs text-muted">
              <li><button onClick={() => setActiveTab("home")} className="hover:text-brand">الرئيسية</button></li>
              <li><button onClick={() => { setShowBillingModal(true); fetchBilling(); }} className="hover:text-brand">الأسعار والباقات</button></li>
              <li><a href="/privacy.html" className="hover:text-brand">سياسة الخصوصية</a></li>
              <li><a href="/terms.html" className="hover:text-brand">شروط الاستخدام</a></li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-xs text-ink uppercase">الدعم والأمان</div>
            <ul className="space-y-1.5 text-xs text-muted">
              <li><a href="/report" className="hover:text-brand">الإبلاغ عن محتوى مخالف</a></li>
              <li><span className="text-emerald-600 font-semibold">حالة النظام: تشغيل 100%</span></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 mt-8 border-t border-line flex flex-col sm:flex-row items-center justify-between text-xs text-muted gap-2">
          <div>© {new Date().getFullYear()} مسيدي (Masidy.app). جميع الحقوق محفوظة.</div>
          <div>تم التطوير بنجاح على Cloudflare Workers & Durable Objects</div>
        </div>
      </footer>
    </div>
  );
}

// Mount React App
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<MasidyApp />);
}
