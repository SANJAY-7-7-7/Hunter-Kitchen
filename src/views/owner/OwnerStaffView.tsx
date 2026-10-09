import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { apiService } from '../../services/api';
import {
  validateName,
  validatePhone,
  validateEmail,
  sanitizeTypingPhone,
  sanitizeTypingName
} from '../../utils/validation';
import {
  Users,
  Bike,
  Plus,
  Check,
  X,
  Shield,
  Phone,
  Mail,
  Edit,
  Trash2,
  Search,
  Star,
  Award,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChefHat,
  CookingPot,
  ClipboardList
} from 'lucide-react';

export const OwnerStaffView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'STAFF' | 'DELIVERY'>('STAFF');
  const [staffList, setStaffList] = useState<User[]>([]);
  const [deliveryList, setDeliveryList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Staff Modal State
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState<'KITCHEN_STAFF' | 'GENERAL_MANAGER'>('KITCHEN_STAFF');

  // Add Delivery Partner Modal State
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('TN-37-XX-1234');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<'KITCHEN_STAFF' | 'GENERAL_MANAGER'>('KITCHEN_STAFF');

  // Delete Confirmation State
  const [deletingUserConfirm, setDeletingUserConfirm] = useState<User | null>(null);

  const loadData = async () => {
    try {
      const [staffData, driverData] = await Promise.all([
        apiService.getUsers('STAFF'),
        apiService.getUsers('DELIVERY_PARTNER')
      ]);
      setStaffList(staffData);
      setDeliveryList(driverData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddStaff = () => {
    setStaffName('');
    setStaffEmail('');
    setStaffPhone('');
    setStaffRole('KITCHEN_STAFF');
    setModalError(null);
    setShowAddStaffModal(true);
  };

  const handleOpenAddDriver = () => {
    setDriverName('');
    setDriverEmail('');
    setDriverPhone('');
    setVehicleNumber('TN-37-XX-1234');
    setModalError(null);
    setShowAddDriverModal(true);
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strict Validation
    const nameRes = validateName(staffName);
    if (!nameRes.isValid) {
      setModalError(nameRes.error || 'Please enter a valid staff name.');
      return;
    }

    const emailRes = validateEmail(staffEmail);
    if (!emailRes.isValid) {
      setModalError(emailRes.error || 'Please enter a valid Gmail address.');
      return;
    }

    const phoneRes = validatePhone(staffPhone);
    if (!phoneRes.isValid) {
      setModalError(phoneRes.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setModalError(null);
    setIsSubmitting(true);
    try {
      await apiService.addStaff({
        name: nameRes.value,
        email: emailRes.value,
        phone: phoneRes.value,
        staffRole
      });
      setShowAddStaffModal(false);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || 'Failed to add staff member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strict Validation
    const nameRes = validateName(driverName);
    if (!nameRes.isValid) {
      setModalError(nameRes.error || 'Please enter a valid partner name.');
      return;
    }

    const emailRes = validateEmail(driverEmail);
    if (!emailRes.isValid) {
      setModalError(emailRes.error || 'Please enter a valid Gmail address.');
      return;
    }

    const phoneRes = validatePhone(driverPhone);
    if (!phoneRes.isValid) {
      setModalError(phoneRes.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setModalError(null);
    setIsSubmitting(true);
    try {
      await apiService.addDeliveryPartner({
        name: nameRes.value,
        email: emailRes.value,
        phone: phoneRes.value,
        vehicleNumber: vehicleNumber.trim() || 'TN-37-XX-1234',
        vehicleType: 'Bike'
      });
      setShowAddDriverModal(false);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || 'Failed to add delivery partner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStaffStatus = async (user: User) => {
    const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiService.updateStaff(user.id, { status: nextStatus });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleDriverStatus = async (user: User) => {
    const nextStatus = user.partnerStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    try {
      await apiService.updateDeliveryPartnerStatus(user.id, nextStatus);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditName(user.name ? user.name.replace(/[-]/g, '') : '');
    setEditEmail(user.email || '');
    setEditPhone(user.phone ? user.phone.replace(/\D/g, '').slice(-10) : '');
    setEditVehicleNumber(user.vehicleNumber || '');
    setEditStaffRole(user.staffRole === 'GENERAL_MANAGER' ? 'GENERAL_MANAGER' : 'KITCHEN_STAFF');
    setModalError(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const nameRes = validateName(editName);
    if (!nameRes.isValid) {
      setModalError(nameRes.error || 'Please enter a valid full name.');
      return;
    }

    const emailRes = validateEmail(editEmail);
    if (!emailRes.isValid) {
      setModalError(emailRes.error || 'Please enter a valid Gmail address.');
      return;
    }

    const phoneRes = validatePhone(editPhone);
    if (!phoneRes.isValid) {
      setModalError(phoneRes.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setModalError(null);
    setIsSubmitting(true);
    try {
      if (editingUser.role === 'STAFF') {
        await apiService.updateStaff(editingUser.id, {
          name: nameRes.value,
          email: emailRes.value,
          phone: phoneRes.value,
          staffRole: editStaffRole
        });
      } else {
        await apiService.updateDeliveryPartner(editingUser.id, {
          name: nameRes.value,
          email: emailRes.value,
          phone: phoneRes.value,
          vehicleNumber: editVehicleNumber.trim() || 'Bike'
        });
      }
      setShowEditModal(false);
      setEditingUser(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || 'Failed to update user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTrigger = (user: User) => {
    setModalError(null);
    setDeletingUserConfirm(user);
  };

  const confirmDeleteUser = async () => {
    if (!deletingUserConfirm) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      await apiService.deleteUser(deletingUserConfirm.id);
      // Optimistically update local state immediately
      setStaffList((prev) => prev.filter((u) => u.id !== deletingUserConfirm.id));
      setDeliveryList((prev) => prev.filter((u) => u.id !== deletingUserConfirm.id));
      setDeletingUserConfirm(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      setModalError(err.message || 'Failed to delete user from database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Search filter
  const filteredStaff = staffList.filter((st) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = st.name.toLowerCase().includes(q);
    const emailMatch = st.email.toLowerCase().includes(q);
    const phoneMatch = st.phone.toLowerCase().includes(q);
    const roleMatch = (st.staffRole || '').replace(/_/g, ' ').toLowerCase().includes(q);
    const statusMatch = st.status.toLowerCase().includes(q);
    return nameMatch || emailMatch || phoneMatch || roleMatch || statusMatch;
  });

  const filteredDrivers = deliveryList.filter((dr) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = dr.name.toLowerCase().includes(q);
    const emailMatch = dr.email.toLowerCase().includes(q);
    const phoneMatch = dr.phone.toLowerCase().includes(q);
    const vehicleMatch = (dr.vehicleNumber || '').toLowerCase().includes(q);
    const statusMatch = (dr.partnerStatus || '').toLowerCase().includes(q);
    return nameMatch || emailMatch || phoneMatch || vehicleMatch || statusMatch;
  });

  return (
    <div className="pb-28 md:pb-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">Staff & Delivery Fleet</h2>
          <p className="text-xs text-stone-500 font-medium mt-0.5">Manage kitchen staff roles, delivery fleet, & contact credentials</p>
        </div>

        <button
          onClick={() => (activeTab === 'STAFF' ? handleOpenAddStaff() : handleOpenAddDriver())}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-red-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-md shadow-red-700/20 hover:bg-red-800 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add {activeTab === 'STAFF' ? 'Staff' : 'Driver'}</span>
        </button>
      </div>

      {/* Modern Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5 pointer-events-none" />
        <input
          type="text"
          placeholder={`Search ${activeTab === 'STAFF' ? 'kitchen staff' : 'delivery partners'} by name, role, email, or phone...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 shadow-2xs placeholder:text-stone-400 font-medium transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-3 text-stone-400 hover:text-stone-700 p-0.5 rounded-md cursor-pointer transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Premium Symmetrical Segmented Tab Control */}
      <div className="bg-stone-100 p-1 sm:p-1.5 rounded-2xl border border-stone-200/90 shadow-2xs">
        <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('STAFF')}
            className={`h-10 sm:h-11 px-2.5 sm:px-4 rounded-xl inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-150 cursor-pointer select-none ${
              activeTab === 'STAFF'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80 font-black'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/50 font-bold'
            }`}
          >
            <Users
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors ${
                activeTab === 'STAFF' ? 'text-blue-600' : 'text-stone-400'
              }`}
            />
            <span className="text-xs sm:text-sm tracking-tight whitespace-nowrap font-bold">
              Kitchen Staff
            </span>
            <span
              className={`h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-black leading-none shrink-0 transition-colors ${
                activeTab === 'STAFF'
                  ? 'bg-blue-100 text-blue-800 border border-blue-200/80'
                  : 'bg-stone-200/90 text-stone-600'
              }`}
            >
              {staffList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DELIVERY')}
            className={`h-10 sm:h-11 px-2.5 sm:px-4 rounded-xl inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-150 cursor-pointer select-none ${
              activeTab === 'DELIVERY'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80 font-black'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/50 font-bold'
            }`}
          >
            <Bike
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors ${
                activeTab === 'DELIVERY' ? 'text-rose-600' : 'text-stone-400'
              }`}
            />
            <span className="text-xs sm:text-sm tracking-tight whitespace-nowrap font-bold">
              <span className="sm:hidden">Delivery Fleet</span>
              <span className="hidden sm:inline">Delivery Partners</span>
            </span>
            <span
              className={`h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-black leading-none shrink-0 transition-colors ${
                activeTab === 'DELIVERY'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200/80'
                  : 'bg-stone-200/90 text-stone-600'
              }`}
            >
              {deliveryList.length}
            </span>
          </button>
        </div>
      </div>

      {/* List Content */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
          <p className="text-xs font-bold text-stone-500">Loading personnel roster...</p>
        </div>
      ) : activeTab === 'STAFF' ? (
        filteredStaff.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-stone-200">
            <p className="text-sm text-stone-600 font-bold">No kitchen staff found matching "{searchQuery}".</p>
            <p className="text-xs text-stone-400 mt-1">Try searching by a different name, role, email, or mobile number.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredStaff.map((st) => (
              <div
                key={st.id}
                className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs hover:border-stone-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3"
              >
                {/* Header Row: Avatar + Name & Clean Role Badge */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/90 border border-blue-200/70 text-blue-700 flex items-center justify-center font-black text-base shrink-0 shadow-2xs">
                    {st.name ? st.name.charAt(0).toUpperCase() : 'S'}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <h4 className="font-extrabold text-sm sm:text-base text-stone-900 tracking-tight">
                        {st.name}
                      </h4>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/90 tracking-wider shrink-0">
                        {st.staffRole === 'GENERAL_MANAGER' ? (
                          <>
                            <Shield className="w-3 h-3 text-amber-600" />
                            <span>General Manager</span>
                          </>
                        ) : (
                          <>
                            <ChefHat className="w-3 h-3 text-blue-600" />
                            <span>Kitchen Staff</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-[11px] text-stone-400 font-medium">
                      {st.staffRole === 'GENERAL_MANAGER'
                        ? 'Full Access • All Operations & Dispatch'
                        : 'Order Flow • Accept, Prepare & Dispatch'}
                    </p>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-stone-100 text-xs text-stone-600 font-semibold">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{st.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span>{st.phone}</span>
                  </span>
                </div>

                {/* Footer: Status Pill & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <button
                    onClick={() => toggleStaffStatus(st)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-3xs cursor-pointer border ${
                      st.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : st.status === 'INVITED'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                        : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                    }`}
                    title="Click to toggle status"
                  >
                    {st.status}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditModal(st)}
                      className="p-1.5 sm:p-2 rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200/60 transition-all active:scale-95 cursor-pointer shadow-3xs"
                      title="Edit Staff details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteTrigger(st)}
                      className="p-1.5 sm:p-2 rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-stone-200/60 transition-all active:scale-95 cursor-pointer shadow-3xs"
                      title="Delete staff member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        filteredDrivers.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-stone-200">
            <p className="text-sm text-stone-600 font-bold">No delivery partners found matching "{searchQuery}".</p>
            <p className="text-xs text-stone-400 mt-1">Try searching by driver name, vehicle number, email, or phone.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredDrivers.map((dr) => (
              <div
                key={dr.id}
                className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs hover:border-stone-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3"
              >
                {/* Header Row: Avatar + Name & Vehicle Badge */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/90 border border-rose-200/70 text-rose-600 flex items-center justify-center font-bold text-base shrink-0 shadow-2xs">
                    <Bike className="w-5 h-5 stroke-[2.2]" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <h4 className="font-extrabold text-sm sm:text-base text-stone-900 tracking-tight">
                        {dr.name}
                      </h4>
                      <span className="font-extrabold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200 text-[11px] uppercase tracking-wider shrink-0">
                        {dr.vehicleNumber || 'Bike'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-extrabold text-amber-600">
                      <span className="flex items-center gap-1 text-amber-500 font-black">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span className="text-stone-900 font-black">{dr.currentRating || 5.0}</span>
                      </span>
                      <span className="text-stone-300">•</span>
                      <span className="text-stone-500 font-medium text-[11px]">
                        {dr.totalDeliveries || 0} Deliveries Completed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-stone-100 text-xs text-stone-600 font-semibold">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{dr.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span>{dr.phone}</span>
                  </span>
                </div>

                {/* Footer: Status Pill & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <button
                    onClick={() => toggleDriverStatus(dr)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-3xs cursor-pointer border ${
                      dr.partnerStatus === 'ONLINE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                    }`}
                    title="Click to toggle status"
                  >
                    {dr.partnerStatus || 'OFFLINE'}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditModal(dr)}
                      className="p-1.5 sm:p-2 rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200/60 transition-all active:scale-95 cursor-pointer shadow-3xs"
                      title="Edit Delivery Partner details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteTrigger(dr)}
                      className="p-1.5 sm:p-2 rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-stone-200/60 transition-all active:scale-95 cursor-pointer shadow-3xs"
                      title="Delete Delivery Partner"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Add Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-extrabold text-stone-900 text-base">Invite Kitchen Staff</h3>
                <p className="text-xs text-stone-500 font-medium">Add a new staff member to your kitchen team</p>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddStaffSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Staff Full Name</label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(sanitizeTypingName(e.target.value))}
                  placeholder="e.g. Ramesh V"
                  maxLength={70}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Gmail / Email Address</label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="e.g. staff@gmail.com"
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Phone Number (10 digits)</label>
                <input
                  type="tel"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(sanitizeTypingPhone(e.target.value))}
                  placeholder="e.g. 9876543210"
                  maxLength={10}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Assign Role / Station</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full p-3 border border-stone-200 rounded-xl bg-white font-bold text-stone-800 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm cursor-pointer"
                >
                  <option value="KITCHEN_STAFF">Staff (Order Accept, Reject & Driver Assign)</option>
                  <option value="GENERAL_MANAGER">General Manager (All Access & Self-Delivery)</option>
                </select>
                <p className="text-[11px] text-stone-500 font-medium mt-1">
                  • Staff: Can accept, reject orders, mark food prep, and assign delivery partners.<br />
                  • General Manager: Full kitchen controls + can also deliver orders directly.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="flex-1 py-3 rounded-xl border border-stone-200 font-extrabold text-stone-700 hover:bg-stone-50 text-xs sm:text-sm cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-red-700 hover:bg-red-800 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-red-700/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Sending...' : 'Invite Staff'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {showAddDriverModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-extrabold text-stone-900 text-base">Add Delivery Partner</h3>
                <p className="text-xs text-stone-500 font-medium">Register a driver to your delivery fleet</p>
              </div>
              <button
                onClick={() => setShowAddDriverModal(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddDriverSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Partner Name</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(sanitizeTypingName(e.target.value))}
                  placeholder="e.g. Arun Kumar"
                  maxLength={70}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Gmail / Email Address</label>
                <input
                  type="email"
                  value={driverEmail}
                  onChange={(e) => setDriverEmail(e.target.value)}
                  placeholder="e.g. driver@gmail.com"
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Phone Number (10 digits)</label>
                <input
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(sanitizeTypingPhone(e.target.value))}
                  placeholder="e.g. 9876543210"
                  maxLength={10}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Vehicle Registration Number</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="TN-37-AB-1234"
                  maxLength={20}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 uppercase focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDriverModal(false)}
                  className="flex-1 py-3 rounded-xl border border-stone-200 font-extrabold text-stone-700 hover:bg-stone-50 text-xs sm:text-sm cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-red-700 hover:bg-red-800 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-red-700/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Saving...' : 'Add Partner'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-extrabold text-stone-900 text-base">
                  Edit {editingUser.role === 'STAFF' ? 'Kitchen Staff' : 'Delivery Partner'}
                </h3>
                <p className="text-xs text-stone-500 font-medium">Update account information and station assignments</p>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                className="p-1.5 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(sanitizeTypingName(e.target.value))}
                  maxLength={70}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Gmail / Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="font-extrabold text-stone-700 block mb-1">Phone Number (10 digits)</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(sanitizeTypingPhone(e.target.value))}
                  maxLength={10}
                  className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                  required
                />
              </div>

              {editingUser.role === 'STAFF' && (
                <div>
                  <label className="font-extrabold text-stone-700 block mb-1">Assign Role / Station</label>
                  <select
                    value={editStaffRole}
                    onChange={(e) => setEditStaffRole(e.target.value as any)}
                    className="w-full p-3 border border-stone-200 rounded-xl bg-white font-bold text-stone-800 focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm cursor-pointer"
                  >
                    <option value="KITCHEN_STAFF">Staff (Order Accept, Reject & Driver Assign)</option>
                    <option value="GENERAL_MANAGER">General Manager (All Access & Self-Delivery)</option>
                  </select>
                </div>
              )}

              {editingUser.role === 'DELIVERY_PARTNER' && (
                <div>
                  <label className="font-extrabold text-stone-700 block mb-1">Vehicle Registration Number</label>
                  <input
                    type="text"
                    value={editVehicleNumber}
                    onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase().slice(0, 20))}
                    maxLength={20}
                    className="w-full p-3 border border-stone-200 rounded-xl font-semibold text-stone-900 uppercase focus:ring-2 focus:ring-red-600/20 focus:border-red-600 outline-none text-xs sm:text-sm"
                    required
                  />
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                  className="flex-1 py-3 rounded-xl border border-stone-200 font-extrabold text-stone-700 hover:bg-stone-50 text-xs sm:text-sm cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-red-700 hover:bg-red-800 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-red-700/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Safe Delete Confirmation Modal */}
      {deletingUserConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="font-extrabold text-red-600 text-sm sm:text-base flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600" /> Confirm Deletion
              </h3>
              <button
                disabled={isSubmitting}
                onClick={() => setDeletingUserConfirm(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-semibold text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="space-y-2 text-xs sm:text-sm">
              <p className="text-stone-700 leading-relaxed font-medium">
                Are you sure you want to remove <strong className="text-stone-950 font-extrabold">{deletingUserConfirm.name}</strong> from the team?
              </p>
              
              <div className="p-3 bg-red-50 text-red-800 rounded-2xl border border-red-100 font-semibold text-xs leading-relaxed">
                ⚠️ Warning: This user will be permanently removed from PostgreSQL and will no longer have system access.
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                disabled={isSubmitting}
                onClick={() => setDeletingUserConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 font-extrabold text-stone-700 text-xs sm:text-sm hover:bg-stone-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isSubmitting}
                onClick={confirmDeleteUser}
                className="flex-1 py-2.5 rounded-xl text-white font-extrabold text-xs sm:text-sm bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isSubmitting ? 'Deleting...' : 'Delete User'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
