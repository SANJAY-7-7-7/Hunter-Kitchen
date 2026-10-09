import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { apiService } from '../../services/api';
import { OtpInput } from '../../components/auth/OtpInput';
import { StaffActivityLogHub } from '../../components/StaffActivityLogHub';
import {
  validateName,
  validatePhone,
  validateEmail,
  validatePassword,
  sanitizeTypingPhone,
  sanitizeTypingName
} from '../../utils/validation';
import {
  User,
  Store,
  Phone,
  Mail,
  Shield,
  Bell,
  LogOut,
  Save,
  Check,
  Power,
  Clock,
  MapPin,
  IndianRupee,
  CreditCard,
  Banknote,
  AlertTriangle,
  Megaphone,
  ShieldCheck,
  Activity,
  Edit2,
  X,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  RotateCcw,
  ClipboardList
} from 'lucide-react';

export const OwnerProfileView: React.FC = () => {
  const { currentUser, settings, refreshSettings, updateUserProfile, logout } = useAuth();
  const { webPushPermission, requestWebPushPermission, isPushAlertsEnabled, togglePushAlerts } = useNotification();

  // Navigation tab inside Profile & Store Ops
  const [activeTab, setActiveTab] = useState<'profile' | 'store_settings' | 'audit_logs'>('profile');

  // --- Admin Profile State ---
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [adminName, setAdminName] = useState(currentUser?.name || 'Karthik Raja');
  const [adminEmail, setAdminEmail] = useState(currentUser?.email || 'karthik@hunterskitchen.com');
  const [adminPhone, setAdminPhone] = useState(currentUser?.phone || '+91 98765 43210');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- Email Change OTP Modal State ---
  const [showEmailOtpModal, setShowEmailOtpModal] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);
  const [otpModalError, setOtpModalError] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState<number>(600);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // --- Notification Preferences ---
  const [orderAudioAlerts, setOrderAudioAlerts] = useState(true);
  const [emailDigestAlerts, setEmailDigestAlerts] = useState(true);
  const [smsCriticalAlerts, setSmsCriticalAlerts] = useState(true);

  // --- Store Operations & Master Open/Close State ---
  const [isStoreOpen, setIsStoreOpen] = useState(settings?.isOpen ?? true);
  const [temporaryPause, setTemporaryPause] = useState(settings?.temporaryPause ?? false);
  const [restaurantName, setRestaurantName] = useState(settings?.restaurantName || "Hunter's Kitchen");
  const [supportPhone, setSupportPhone] = useState(settings?.phone || '+91 98765 00000');
  const [storeAddress, setStoreAddress] = useState(settings?.address || '42 Richmond Road, Shanthi Nagar, Bengaluru');
  const [openingTime, setOpeningTime] = useState(settings?.openingTime || '11:00 AM');
  const [closingTime, setClosingTime] = useState(settings?.closingTime || '11:00 PM');
  const [baseDeliveryFee, setBaseDeliveryFee] = useState(settings?.baseDeliveryFee ?? 35);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(settings?.freeDeliveryThreshold ?? 500);
  const [codEnabled, setCodEnabled] = useState(settings?.codEnabled ?? true);
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState(settings?.onlinePaymentEnabled ?? true);
  const [announcement, setAnnouncement] = useState(settings?.announcement || '');
  
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [storeSavedMsg, setStoreSavedMsg] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // --- Audit & Outbox States ---
  const [integrityReport, setIntegrityReport] = useState<any | null>(null);
  const [isVerifyingChain, setIsVerifyingChain] = useState(false);
  const [reconciliationReport, setReconciliationReport] = useState<any | null>(null);
  const [outboxEvents, setOutboxEvents] = useState<any[]>([]);
  const [isLoadingOutbox, setIsLoadingOutbox] = useState(false);

  // Synchronize state when settings or currentUser change
  useEffect(() => {
    if (settings) {
      setIsStoreOpen(settings.isOpen ?? true);
      setTemporaryPause(settings.temporaryPause ?? false);
      setRestaurantName(settings.restaurantName || "Hunter's Kitchen");
      setSupportPhone(settings.phone || '+91 98765 00000');
      setStoreAddress(settings.address || '42 Richmond Road, Shanthi Nagar, Bengaluru');
      setOpeningTime(settings.openingTime || '11:00 AM');
      setClosingTime(settings.closingTime || '11:00 PM');
      setBaseDeliveryFee(settings.baseDeliveryFee ?? 35);
      setFreeDeliveryThreshold(settings.freeDeliveryThreshold ?? 500);
      setCodEnabled(settings.codEnabled ?? true);
      setOnlinePaymentEnabled(settings.onlinePaymentEnabled ?? true);
      setAnnouncement(settings.announcement || '');
    }
  }, [settings]);

  useEffect(() => {
    if (currentUser) {
      setAdminName(currentUser.name || '');
      setAdminEmail(currentUser.email || '');
      setAdminPhone(currentUser.phone || '');
      setAdminPassword('');
      setAdminConfirmPassword('');
    }
  }, [currentUser]);

  // Countdown timer for OTP validity
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showEmailOtpModal && otpCountdown > 0) {
      timer = setInterval(() => {
        setOtpCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showEmailOtpModal, otpCountdown]);

  // Cooldown timer for resending OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Master Store Open/Closed Toggle
  const handleToggleStoreStatus = async () => {
    setIsTogglingStatus(true);
    const newStatus = !isStoreOpen;
    try {
      await apiService.updateSettings({ isOpen: newStatus });
      await refreshSettings();
      setIsStoreOpen(newStatus);
      setStoreSavedMsg(newStatus ? '🟢 Shop is now OPEN for customer orders!' : '🔴 Shop is now CLOSED. Ordering disabled.');
      setTimeout(() => setStoreSavedMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to toggle store status', err);
      alert('Error updating store status: ' + (err.message || 'Please try again.'));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Master Pause Toggle
  const handleToggleTemporaryPause = async () => {
    setIsTogglingStatus(true);
    const newPause = !temporaryPause;
    try {
      await apiService.updateSettings({ temporaryPause: newPause });
      await refreshSettings();
      setTemporaryPause(newPause);
      setStoreSavedMsg(newPause ? '⏸️ Kitchen rush pause activated (New orders paused)' : '▶️ Kitchen pause resumed. Ready for orders.');
      setTimeout(() => setStoreSavedMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to update pause status', err);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Save Store Settings Form
  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStore(true);
    try {
      await apiService.updateSettings({
        restaurantName,
        phone: supportPhone,
        address: storeAddress,
        openingTime,
        closingTime,
        baseDeliveryFee: Number(baseDeliveryFee),
        freeDeliveryThreshold: Number(freeDeliveryThreshold),
        codEnabled,
        onlinePaymentEnabled,
        announcement
      });
      await refreshSettings();
      setStoreSavedMsg('Store configuration updated successfully!');
      setTimeout(() => setStoreSavedMsg(null), 3500);
    } catch (err: any) {
      console.error(err);
      alert('Failed to save settings: ' + (err.message || 'Server error'));
    } finally {
      setIsSavingStore(false);
    }
  };

  // Save Admin Personal Profile (Requires Gmail OTP if email changed)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strict client-side validation & formatting
    const nameRes = validateName(adminName);
    if (!nameRes.isValid) {
      setProfileMsg({ type: 'error', text: nameRes.error || 'Please enter a valid full name.' });
      return;
    }

    const phoneRes = validatePhone(adminPhone);
    if (!phoneRes.isValid) {
      setProfileMsg({ type: 'error', text: phoneRes.error || 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    const emailRes = validateEmail(adminEmail);
    if (!emailRes.isValid) {
      setProfileMsg({ type: 'error', text: emailRes.error || 'Please enter a valid Gmail address.' });
      return;
    }

    if (adminPassword) {
      const passRes = validatePassword(adminPassword, adminConfirmPassword);
      if (!passRes.isValid) {
        setProfileMsg({ type: 'error', text: passRes.error || 'Invalid password.' });
        return;
      }
    }

    const isEmailChanging = emailRes.value !== (currentUser?.email || '').toLowerCase();

    // If email is changing, OTP verification through Gmail is mandatory!
    if (isEmailChanging) {
      setIsSendingOtp(true);
      setProfileMsg(null);
      setOtpModalError(null);
      setEmailOtpCode('');
      try {
        const res = await apiService.sendOtp(emailRes.value, 'EMAIL_CHANGE');
        setOtpCountdown(res.expiresInSeconds || 600);
        setResendCooldown(20);
        setShowEmailOtpModal(true);
      } catch (err: any) {
        console.error(err);
        setProfileMsg({ type: 'error', text: err.message || 'Failed to dispatch verification code to new Gmail.' });
      } finally {
        setIsSendingOtp(false);
      }
      return;
    }

    // Email unchanged -> Save directly
    setIsSavingProfile(true);
    setProfileMsg(null);
    try {
      await updateUserProfile({
        name: nameRes.value,
        email: emailRes.value,
        phone: phoneRes.value,
        password: adminPassword.trim() || undefined
      });
      setIsEditingProfile(false);
      setAdminPassword('');
      setAdminConfirmPassword('');
      setProfileMsg({ type: 'success', text: 'Admin profile and credentials updated successfully!' });
      setTimeout(() => setProfileMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      setProfileMsg({ type: 'error', text: err.message || 'Failed to update admin profile.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Resend OTP code to the new Gmail
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpModalError(null);
    try {
      const res = await apiService.sendOtp(adminEmail.trim().toLowerCase(), 'EMAIL_CHANGE');
      setOtpCountdown(res.expiresInSeconds || 600);
      setResendCooldown(20);
    } catch (err: any) {
      setOtpModalError(err.message || 'Failed to resend code');
    }
  };

  // Confirm OTP and commit email + password changes
  const handleConfirmEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOtpCode.trim() || emailOtpCode.trim().length !== 6) {
      setOtpModalError('Please enter the full 6-digit verification code.');
      return;
    }

    const nameRes = validateName(adminName);
    const phoneRes = validatePhone(adminPhone);
    const emailRes = validateEmail(adminEmail);

    if (!nameRes.isValid || !phoneRes.isValid || !emailRes.isValid) {
      setOtpModalError(nameRes.error || phoneRes.error || emailRes.error || 'Please ensure all profile fields are valid.');
      return;
    }

    setIsVerifyingEmailOtp(true);
    setOtpModalError(null);
    try {
      await updateUserProfile({
        name: nameRes.value,
        phone: phoneRes.value,
        email: emailRes.value,
        password: adminPassword.trim() || undefined,
        otp: emailOtpCode.trim()
      });

      setShowEmailOtpModal(false);
      setIsEditingProfile(false);
      setAdminPassword('');
      setAdminConfirmPassword('');
      setEmailOtpCode('');
      setProfileMsg({
        type: 'success',
        text: `Gmail address verified and updated to ${emailRes.value}! From now on, you must log in using this new Gmail and your password.`
      });
      setTimeout(() => setProfileMsg(null), 6000);
    } catch (err: any) {
      console.error(err);
      setOtpModalError(err.message || 'Invalid or expired verification code. Please try again.');
    } finally {
      setIsVerifyingEmailOtp(false);
    }
  };

  // Audit Verification
  const handleVerifyAudit = async () => {
    setIsVerifyingChain(true);
    try {
      const data = await apiService.verifyAuditIntegrity();
      setIntegrityReport(data);
      const recon = await apiService.runReconciliation();
      setReconciliationReport(recon);
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifyingChain(false);
    }
  };

  const handleLoadOutbox = async () => {
    setIsLoadingOutbox(true);
    try {
      const data = await apiService.getOutboxEvents(20);
      setOutboxEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingOutbox(false);
    }
  };

  return (
    <div className="pb-28 md:pb-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-stone-900 text-white p-5 sm:p-6 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-red-600/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 z-10">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-red-600/30 shrink-0">
            {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight truncate">{currentUser?.name || 'Administrator'}</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-stone-950 font-black text-[10px] uppercase tracking-wider shrink-0 shadow-xs">
                Super Admin
              </span>
            </div>
            <div className="text-xs text-stone-300 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
              {currentUser?.email && (
                <span className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="break-all">{currentUser.email}</span>
                </span>
              )}
              {currentUser?.phone && (
                <span className="flex items-center gap-1.5 shrink-0">
                  <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>{currentUser.phone}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Sign Out Header Action */}
        <button
          type="button"
          onClick={() => logout()}
          className="z-10 self-start sm:self-center px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-red-600 text-white text-xs font-bold transition-all flex items-center gap-2 border border-white/10 cursor-pointer shadow-sm active:scale-95 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* SPECIAL ADMIN MASTER SETTING: SHOP OPEN / CLOSE CARD */}
      <div className={`rounded-3xl border-2 p-5 transition-all shadow-md ${
        isStoreOpen
          ? 'bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 border-emerald-300'
          : 'bg-gradient-to-br from-rose-50/80 via-white to-stone-50 border-rose-300'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                <span>Master Kitchen & Online Ordering Control</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className={`w-3 h-3 rounded-full shrink-0 ${isStoreOpen ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-rose-500'}`}></span>
              <h3 className={`text-xl sm:text-2xl font-black tracking-tight ${isStoreOpen ? 'text-emerald-900' : 'text-rose-900'}`}>
                {isStoreOpen ? 'Restaurant is Open' : 'Restaurant is Closed'}
              </h3>
            </div>

            <p className="text-xs text-stone-600 font-medium max-w-lg leading-relaxed">
              {isStoreOpen
                ? 'The store is live. Customers can browse the full menu, customize items, and place real-time delivery and takeaway orders.'
                : 'Ordering is temporarily paused for all customers. Menu items will show as unavailable for checkout until re-opened.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:items-center gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-stone-200/60">
            {/* Master Open/Close Toggle Button */}
            <button
              type="button"
              disabled={isTogglingStatus}
              onClick={handleToggleStoreStatus}
              className={`px-5 py-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                isStoreOpen
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25'
              }`}
            >
              {isTogglingStatus ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Power className="w-4 h-4 shrink-0" />
              )}
              <span>{isStoreOpen ? 'Close Shop Now' : 'Open Shop Now'}</span>
            </button>

            {/* Quick Kitchen Rush Pause */}
            <button
              type="button"
              disabled={isTogglingStatus}
              onClick={handleToggleTemporaryPause}
              className={`px-4 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer whitespace-nowrap ${
                temporaryPause
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
              title="Pause new orders temporarily during kitchen rush"
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>{temporaryPause ? 'Kitchen Paused (Resume)' : 'Pause Orders (Rush)'}</span>
            </button>
          </div>
        </div>

        {storeSavedMsg && (
          <div className="mt-4 p-3 bg-emerald-100/90 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{storeSavedMsg}</span>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto no-scrollbar scroll-smooth gap-1.5 p-1.5 bg-stone-100 rounded-2xl border border-stone-200 shadow-2xs text-xs font-bold">
        <button
          onClick={() => setActiveTab('profile')}
          className={`shrink-0 py-2.5 px-3.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'profile'
              ? 'bg-white text-stone-900 shadow-xs font-extrabold'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
          }`}
        >
          <User className="w-4 h-4 text-red-600 shrink-0" />
          <span>Admin Profile & Alerts</span>
        </button>

        <button
          onClick={() => setActiveTab('store_settings')}
          className={`shrink-0 py-2.5 px-3.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'store_settings'
              ? 'bg-white text-stone-900 shadow-xs font-extrabold'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
          }`}
        >
          <Store className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Store Configuration</span>
        </button>

        <button
          onClick={() => setActiveTab('audit_logs')}
          className={`shrink-0 py-2.5 px-3.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'audit_logs'
              ? 'bg-white text-stone-900 shadow-xs font-extrabold'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Staff & Delivery Activity Log</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: ADMIN PROFILE & NOTIFICATION PREFERENCES */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {profileMsg && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                profileMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {profileMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{profileMsg.text}</span>
            </div>
          )}

          {/* Personal Account Information */}
          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h4 className="font-extrabold text-sm text-stone-900">Personal Information</h4>
                <p className="text-xs text-stone-500 font-medium">Manage your administrator account credentials</p>
              </div>

              {!isEditingProfile && (
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-stone-600" /> Edit Details
                </button>
              )}
            </div>

            {isEditingProfile ? (
              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Full Name / Receiver Name</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value.slice(0, 70))}
                    placeholder="e.g. Karthik Raja"
                    maxLength={70}
                    className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Gmail / Email Address</label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="name@gmail.com"
                      className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none"
                      required
                    />
                    {adminEmail.trim().toLowerCase() !== (currentUser?.email || '').toLowerCase() && (
                      <p className="text-[11px] text-amber-700 font-medium mt-1 flex items-center gap-1">
                        <span>⚠️ Changing Gmail requires mandatory OTP verification before saving.</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="font-bold text-stone-700 block mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(sanitizeTypingPhone(e.target.value))}
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Password Fields for this Gmail Account */}
                <div className="pt-2 border-t border-stone-100">
                  <div className="mb-2">
                    <span className="font-bold text-stone-800 text-xs flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-stone-600" /> Account Password
                    </span>
                    <p className="text-[11px] text-stone-500">
                      Set a password for your changed Gmail account (min 6 characters). Next time you sign in, you can log in with this new Gmail and password.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-stone-700 block mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          placeholder="Leave blank to keep existing"
                          className="w-full p-3 pr-10 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                          title={showPassword ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-stone-700 block mb-1">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={adminConfirmPassword}
                          onChange={(e) => setAdminConfirmPassword(e.target.value)}
                          placeholder="Re-type new password"
                          className="w-full p-3 pr-10 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                          title={showConfirmPassword ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setAdminPassword('');
                      setAdminConfirmPassword('');
                      setAdminEmail(currentUser?.email || '');
                      setAdminName(currentUser?.name || '');
                      setAdminPhone(currentUser?.phone || '');
                    }}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 font-bold hover:bg-stone-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProfile || isSendingOtp}
                    className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold flex items-center gap-1.5 shadow-md shadow-red-700/20 cursor-pointer transition-all active:scale-95"
                  >
                    {isSavingProfile || isSendingOtp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>
                      {isSendingOtp
                        ? 'Sending OTP...'
                        : adminEmail.trim().toLowerCase() !== (currentUser?.email || '').toLowerCase()
                        ? 'Verify & Save Changes'
                        : 'Save Changes'}
                    </span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80">
                  <span className="text-[10px] font-bold text-stone-400 block uppercase tracking-wider mb-1">
                    Receiver / Admin Name
                  </span>
                  <p className="font-extrabold text-stone-900 text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{currentUser?.name || "Hunter's Kitchen"}</span>
                  </p>
                </div>

                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80">
                  <span className="text-[10px] font-bold text-stone-400 block uppercase tracking-wider mb-1">
                    Gmail / Email Address
                  </span>
                  <p className="font-extrabold text-stone-900 text-xs sm:text-sm flex items-center gap-2 break-all">
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="break-all">{currentUser?.email}</span>
                  </p>
                </div>

                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80">
                  <span className="text-[10px] font-bold text-stone-400 block uppercase tracking-wider mb-1">
                    Phone Number
                  </span>
                  <p className="font-extrabold text-stone-900 text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{currentUser?.phone}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* NOTIFICATION SETTINGS */}
          <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h4 className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-red-600 shrink-0" />
                <span>Notification & Alert Preferences</span>
              </h4>
              <p className="text-xs text-stone-500 font-medium mt-0.5">Control audio alerts and push notifications for high-priority restaurant events</p>
            </div>

            <div className="space-y-3 pt-1">
              {/* Web Push Notification */}
              <div className="p-4 bg-stone-50 hover:bg-stone-50/80 rounded-2xl border border-stone-200 flex items-center justify-between gap-4 transition-colors">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-bold text-stone-900 text-xs flex flex-wrap items-center gap-2">
                    <span>Web Push Alerts</span>
                    {webPushPermission === 'granted' && isPushAlertsEnabled && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold shrink-0">Active</span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">Receive instant desktop/mobile notification when a new order arrives</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (webPushPermission !== 'granted') {
                      await requestWebPushPermission();
                    } else {
                      togglePushAlerts();
                    }
                  }}
                  className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 shadow-xs active:scale-95 ${
                    webPushPermission === 'granted' && isPushAlertsEnabled
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                >
                  {webPushPermission === 'granted' && isPushAlertsEnabled ? 'Enabled' : 'Enable'}
                </button>
              </div>

              {/* Order Ringtone / Audio Alert */}
              <div className="p-4 bg-stone-50 hover:bg-stone-50/80 rounded-2xl border border-stone-200 flex items-center justify-between gap-4 transition-colors">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-bold text-stone-900 text-xs flex items-center gap-1.5">
                    {orderAudioAlerts ? <Volume2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <VolumeX className="w-4 h-4 text-stone-400 shrink-0" />}
                    <span>Kitchen Bell & Order Sound</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">Play continuous audio chime when new orders enter the kitchen dispatch</p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={orderAudioAlerts}
                  onClick={() => setOrderAudioAlerts(!orderAudioAlerts)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ring-2 ring-stone-900/5 ${
                    orderAudioAlerts ? 'bg-red-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      orderAudioAlerts ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* SMS & Critical Alerts */}
              <div className="p-4 bg-stone-50 hover:bg-stone-50/80 rounded-2xl border border-stone-200 flex items-center justify-between gap-4 transition-colors">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-bold text-stone-900 text-xs">SMS & WhatsApp Critical Dispatch Alerts</div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">Send urgent fallback SMS when delivery drivers do not accept orders within 5 mins</p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={smsCriticalAlerts}
                  onClick={() => setSmsCriticalAlerts(!smsCriticalAlerts)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ring-2 ring-stone-900/5 ${
                    smsCriticalAlerts ? 'bg-red-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      smsCriticalAlerts ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Daily Revenue Email Summary */}
              <div className="p-4 bg-stone-50 hover:bg-stone-50/80 rounded-2xl border border-stone-200 flex items-center justify-between gap-4 transition-colors">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="font-bold text-stone-900 text-xs">Daily Midnight Revenue Summary Email</div>
                  <p className="text-[11px] text-stone-500 leading-relaxed break-all">Send automated financial ledger and order breakdown to {currentUser?.email}</p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={emailDigestAlerts}
                  onClick={() => setEmailDigestAlerts(!emailDigestAlerts)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ring-2 ring-stone-900/5 ${
                    emailDigestAlerts ? 'bg-red-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      emailDigestAlerts ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: STORE CONFIGURATION & OPERATING HOURS */}
      {/* ========================================================================= */}
      {activeTab === 'store_settings' && (
        <form onSubmit={handleSaveStoreSettings} className="space-y-4 animate-in fade-in duration-200 text-xs">
          {storeSavedMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" /> {storeSavedMsg}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs space-y-4">
            <h4 className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-amber-600" /> Store Profile & Public Details
            </h4>

            <div>
              <label className="font-bold text-stone-700 block mb-1">Restaurant Brand Name</label>
              <input
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:border-red-600 outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Customer Support Helpline Phone</label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:border-red-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Physical Kitchen Address</label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:border-red-600 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1 flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5 text-red-600" /> Top Customer Announcement Banner (Optional)
              </label>
              <input
                type="text"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="e.g. Free Dessert on all orders above ₹499 today!"
                className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900 focus:border-red-600 outline-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs space-y-4">
            <h4 className="font-extrabold text-sm text-stone-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" /> Operational Hours & Delivery Pricing
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Opening Time</label>
                <input
                  type="text"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900"
                />
              </div>
              <div>
                <label className="font-bold text-stone-700 block mb-1">Closing Time</label>
                <input
                  type="text"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Base Delivery Fee (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={baseDeliveryFee}
                  onChange={(e) => setBaseDeliveryFee(Number(e.target.value))}
                  className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900"
                />
              </div>
              <div>
                <label className="font-bold text-stone-700 block mb-1">Free Delivery Above (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={freeDeliveryThreshold}
                  onChange={(e) => setFreeDeliveryThreshold(Number(e.target.value))}
                  className="w-full p-3 border border-stone-300 rounded-xl font-semibold text-stone-900"
                />
              </div>
            </div>

            {/* Payment Gateways Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-3 p-3.5 bg-stone-50 rounded-2xl border border-stone-200 cursor-pointer hover:bg-stone-100/80 transition-colors">
                <input
                  type="checkbox"
                  checked={codEnabled}
                  onChange={(e) => setCodEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-600"
                />
                <div>
                  <span className="font-bold text-stone-900 block flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Cash on Delivery (COD)
                  </span>
                  <span className="text-[11px] text-stone-500">Allow customers to pay at door</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-stone-50 rounded-2xl border border-stone-200 cursor-pointer hover:bg-stone-100/80 transition-colors">
                <input
                  type="checkbox"
                  checked={onlinePaymentEnabled}
                  onChange={(e) => setOnlinePaymentEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-600"
                />
                <div>
                  <span className="font-bold text-stone-900 block flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" /> UPI & Online Cards
                  </span>
                  <span className="text-[11px] text-stone-500">Allow instant digital payment</span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingStore}
              className="px-6 py-3.5 rounded-2xl bg-red-700 hover:bg-red-800 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-red-700/25 active:scale-95 transition-all cursor-pointer"
            >
              {isSavingStore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Store Configuration</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: INTEGRITY & OUTBOX */}
      {/* ========================================================================= */}
      {activeTab === 'audit_logs' && (
        <StaffActivityLogHub />
      )}

      

      {/* Real-Time Gmail OTP Verification Modal for Admin Email Change */}
      {showEmailOtpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto shadow-sm">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-stone-900">Verify Your New Gmail</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                A 6-digit verification code was dispatched to <strong className="text-stone-900">{adminEmail}</strong>. Enter it below to confirm your new administrator credentials.
              </p>
            </div>

            {otpModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 animate-shake">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{otpModalError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmailOtpCode('');
                    setOtpModalError(null);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-rose-900 font-bold text-[10px] hover:bg-rose-100 transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-2.5 h-2.5 text-rose-600" />
                  <span>Clear</span>
                </button>
              </div>
            )}

            <form onSubmit={handleConfirmEmailOtp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 text-center mb-3">
                  Enter 6-Digit OTP Code
                </label>
                <div className="py-2">
                  <OtpInput
                    length={6}
                    value={emailOtpCode}
                    onChange={(val) => {
                      setEmailOtpCode(val);
                      if (otpModalError) setOtpModalError(null);
                    }}
                    disabled={isVerifyingEmailOtp}
                    hasError={Boolean(otpModalError)}
                    autoFocus={true}
                  />
                </div>
                {emailOtpCode.length > 0 && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailOtpCode('');
                        setOtpModalError(null);
                      }}
                      className="text-stone-500 hover:text-red-700 text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear PIN</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Expires in {Math.floor(otpCountdown / 60)}:{(otpCountdown % 60).toString().padStart(2, '0')}
                </span>
                <button
                  type="button"
                  disabled={resendCooldown > 0}
                  onClick={handleResendOtp}
                  className={`font-bold transition-colors ${
                    resendCooldown > 0 ? 'text-stone-400 cursor-not-allowed' : 'text-red-700 hover:text-red-800 cursor-pointer'
                  }`}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </button>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-tight">
                <strong>Important:</strong> Once verified, your administrator email changes to <strong>{adminEmail}</strong>. You must use this new Gmail and your password to sign in next time.
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEmailOtpModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingEmailOtp || emailOtpCode.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-red-700/20 transition-colors cursor-pointer"
                >
                  {isVerifyingEmailOtp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Verify & Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
