import React, { useState, useEffect } from 'react';
import { Order, User, OrderStatus } from '../../types';
import { apiService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { DeliveryBatchingModal } from './DeliveryBatchingModal';
import { ReadyOrderModal } from '../../components/ReadyOrderModal';
import { PartnerAssignDropdown } from '../../components/PartnerAssignDropdown';
import { useNotification } from '../../context/NotificationContext';
import {
  Check,
  X,
  Flame,
  Layers,
  Bike,
  Utensils,
  Phone,
  Clock,
  RefreshCw,
  Search,
  CheckCircle2,
  Banknote
} from 'lucide-react';

interface OwnerOrdersViewProps {
  initialStatusFilter?: string;
}

export const OwnerOrdersView: React.FC<OwnerOrdersViewProps> = ({ initialStatusFilter = 'ALL' }) => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveryPartners, setDeliveryPartners] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [searchQuery, setSearchQuery] = useState('');

  // initialStatusFilter prop sync
  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Reject Modal State
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Kitchen busy with high order volume');
  const [isRejecting, setIsRejecting] = useState(false);

  // Batching Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  // Ready Modal State
  const [readyOrderId, setReadyOrderId] = useState<string | null>(null);
  const { addNotification } = useNotification();
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);

  const loadData = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const [ordersData, driversData, staffData] = await Promise.all([
        apiService.getOrders({ role: 'OWNER' }),
        apiService.getUsers('DELIVERY_PARTNER'),
        apiService.getUsers('STAFF')
      ]);

      const safeOrders = Array.isArray(ordersData) ? ordersData : [];
      setOrders(safeOrders);

      const safeDrivers = Array.isArray(driversData) ? driversData : [];

      // Include all active delivery partners, prioritizing online ones
      const combined = safeDrivers.filter((u) => u.role === 'DELIVERY_PARTNER' && (u.partnerStatus === 'ONLINE' || u.status === 'ACTIVE'));

      // De-duplicate by user ID
      const uniquePartnersMap = new Map<string, User>();
      combined.forEach((p) => uniquePartnersMap.set(p.id, p));
      setDeliveryPartners(Array.from(uniquePartnersMap.values()));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      if (manual) {
        setTimeout(() => setIsRefreshing(false), 600);
      }
    }
  };

  const getPartnerInfo = (ord: Order) => {
    if (ord.assignedDeliveryPartnerName && ord.assignedDeliveryPartnerName.trim() !== '') {
      return {
        name: ord.assignedDeliveryPartnerName,
        phone: ord.assignedDeliveryPartnerPhone,
        vehicle: ord.assignedDeliveryPartnerVehicle
      };
    }
    if (ord.assignedDeliveryPartnerId) {
      const match = deliveryPartners.find((d) => d.id === ord.assignedDeliveryPartnerId);
      if (match) {
        return {
          name: match.name,
          phone: match.phone,
          vehicle: match.vehicleNumber || match.vehicleType
        };
      }
    }
    if (['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(ord.status)) {
      const defaultPartner = deliveryPartners[0];
      return {
        name: defaultPartner?.name || 'Delivery Partner',
        phone: defaultPartner?.phone || '+91 91234 56789',
        vehicle: defaultPartner?.vehicleNumber || 'Bike'
      };
    }
    return null;
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);

    const handleOrderUpdate = () => {
      loadData();
    };
    window.addEventListener('hk:order_update', handleOrderUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('hk:order_update', handleOrderUpdate);
    };
  }, []);

  const handleAccept = async (orderId: string) => {
    try {
      await apiService.acceptOrder(orderId, currentUser?.id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectOrderId) return;
    setIsRejecting(true);
    try {
      await apiService.rejectOrder(rejectOrderId, rejectReason, currentUser?.id);
      setRejectOrderId(null);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRejecting(false);
    }
  };

  const handlePrepare = async (orderId: string) => {
    try {
      await apiService.markPreparing(orderId, currentUser?.id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReady = async (orderId: string) => {
    try {
      await apiService.markReady(orderId, currentUser?.id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSingleAssign = async (orderId: string, partnerId: string) => {
    if (!partnerId) return;
    setAssigningOrderId(orderId);
    try {
      if (partnerId === '__UNASSIGN__') {
        await apiService.markReady(orderId, currentUser?.id);
        addNotification({
          title: 'Order Returned to Ready',
          message: 'Order unassigned and returned to ready queue.',
          type: 'INFO'
        });
      } else {
        const partner = deliveryPartners.find((p) => p.id === partnerId);
        await apiService.assignDelivery(orderId, partnerId, currentUser?.id);
        addNotification({
          title: 'Delivery Partner Assigned',
          message: `Assigned to ${partner?.name || 'delivery partner'}.`,
          type: 'SUCCESS'
        });
      }
      await loadData();
    } catch (err: any) {
      console.error(err);
      addNotification({
        title: 'Assignment Failed',
        message: err.message || 'Failed to assign delivery partner.',
        type: 'SYSTEM'
      });
    } finally {
      setAssigningOrderId(null);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'PREPARING') {
        if (o.status !== 'PREPARING' && o.status !== 'ACCEPTED') return false;
      } else if (statusFilter === 'OUT_FOR_DELIVERY') {
        if (o.status !== 'OUT_FOR_DELIVERY' && o.status !== 'PICKED_UP' && o.status !== 'ASSIGNED') return false;
      } else {
        if (o.status !== statusFilter) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q)
      );
    }
    return true;
  });

  const readyOrders = orders.filter((o) => o.status === 'READY');

  return (
    <div className="pb-28 md:pb-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Top Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-stone-900">Live Order Dispatch Board</h2>
        <button
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all active:scale-95 cursor-pointer disabled:opacity-80"
          title="Refresh Orders"
        >
          <RefreshCw className={`w-4 h-4 transition-transform ${isRefreshing ? 'animate-spin text-stone-900' : ''}`} />
        </button>
      </div>

      {/* Batching CTA Banner */}
      {readyOrders.length > 1 && (
        <div className="bg-red-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-amber-400" />
            <div>
              <p className="font-extrabold text-xs">{readyOrders.length} Ready Orders Awaiting Delivery!</p>
              <p className="text-[11px] text-red-200">Batch proximate orders into a single delivery run</p>
            </div>
          </div>

          <button
            onClick={() => setShowBatchModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-400 text-stone-950 font-black text-xs shadow-xs hover:bg-amber-300"
          >
            Create Batch
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
        <input
          type="text"
          placeholder="Search by Order #, Customer Name, Phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-600"
        />
      </div>

      {/* Status Filter Chips */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1">
        {['ALL', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].map(
          (st) => {
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition-all border cursor-pointer select-none ${
                  isSelected
                    ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                {st.replace(/_/g, ' ')}
              </button>
            );
          }
        )}
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="py-8 text-center text-stone-400 text-xs">Loading orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center my-4 space-y-2.5">
          <p className="text-xs text-stone-600 font-medium">
            {statusFilter === 'ALL'
              ? 'No orders placed yet. Live orders will populate here automatically.'
              : `No orders in "${statusFilter.replace(/_/g, ' ')}" status right now.`}
          </p>
          {statusFilter !== 'ALL' && (
            <button
              onClick={() => setStatusFilter('ALL')}
              className="px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-3xs"
            >
              View All Orders
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOrders.map((ord) => (
            <div
              key={ord.id}
              className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${
                ord.status === 'PLACED'
                  ? 'border-amber-400 bg-amber-50/20 ring-1 ring-amber-400/30'
                  : 'border-stone-200'
              }`}
            >
              {/* Order Header: ID, Status, Payment Type & Timestamp */}
              <div className="pb-3 border-b border-stone-100 space-y-2">
                {/* Row 1: Order ID & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-black text-sm sm:text-base text-stone-900 tracking-tight">
                    #{ord.orderNumber}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap border shadow-3xs ${
                      ord.status === 'PLACED'
                        ? 'bg-amber-400 text-stone-950 border-amber-500 animate-pulse'
                        : ord.status === 'ACCEPTED'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : ord.status === 'PREPARING'
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : ord.status === 'READY'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : ord.status === 'ASSIGNED' || ord.status === 'PICKED_UP' || ord.status === 'OUT_FOR_DELIVERY'
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        : ord.status === 'DELIVERED'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : ord.status === 'CANCELLED' || ord.status === 'REJECTED'
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-stone-100 text-stone-800 border-stone-200'
                    }`}
                  >
                    {ord.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Row 2: Payment Method Badge & Time */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                      ord.paymentMethod === 'ONLINE'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {ord.paymentMethod === 'ONLINE' ? 'Paid Online' : 'Cash on Delivery'}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-stone-500">
                    <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span>
                      {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer Info & Address */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-stone-900 truncate">
                    {ord.customerName}
                  </p>
                  <a
                    href={`tel:${ord.customerPhone}`}
                    className="text-stone-600 hover:text-stone-900 font-semibold shrink-0 flex items-center gap-1 hover:underline text-[11px]"
                  >
                    <Phone className="w-3 h-3 text-stone-400" />
                    <span>{ord.customerPhone}</span>
                  </a>
                </div>

                <p className="text-[11px] text-stone-500 leading-relaxed">
                  {ord.deliveryAddress
                    ? `${ord.deliveryAddress.doorNo ? `${ord.deliveryAddress.doorNo}, ` : ''}${ord.deliveryAddress.street || ''}${ord.deliveryAddress.area ? `, ${ord.deliveryAddress.area}` : ''}`
                    : 'Store Pickup / Counter'}
                </p>
              </div>

              {/* Items List */}
              <div className="bg-stone-50/70 rounded-xl p-3 border border-stone-100 space-y-1.5 text-xs text-stone-800">
                {(ord.items || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-stone-900 truncate">
                        <span className="text-red-700 font-black">{item.quantity}x</span> {item.name}
                      </p>
                      {item.customizations && item.customizations.map((c, i) => (
                        <p key={i} className="text-[11px] text-stone-500 pl-4">
                          • {c.optionName}: {c.selectedLabel}
                        </p>
                      ))}
                      {item.addons && item.addons.map((a, i) => (
                        <p key={i} className="text-[11px] text-stone-500 pl-4">
                          + {a.name}
                        </p>
                      ))}
                    </div>
                    <span className="font-bold text-stone-900 font-mono shrink-0">₹{item.totalPrice}</span>
                  </div>
                ))}
              </div>

              {/* Special Instructions Note */}
              {ord.orderNotes && (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-amber-950">
                  <span className="font-bold text-amber-900">Customer Note:</span> {ord.orderNotes}
                </div>
              )}

              {/* Cash on Delivery Breakdown Box */}
              {ord.paymentMethod === 'COD' && (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs flex items-center justify-between gap-3 shadow-3xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-stone-950 flex items-center justify-center font-black shrink-0 shadow-3xs">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-xs text-stone-900 leading-tight">Cash on Delivery</p>
                      <p className="text-[11px] text-stone-600 font-medium truncate mt-0.5">
                        Tendered: <strong className="text-stone-900 font-mono font-bold">₹{ord.codCashTendered || ord.grandTotal}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[9px] uppercase font-extrabold text-stone-500 block tracking-wider">Change Due</span>
                    <span className="font-mono font-black text-xs text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-md inline-block border border-emerald-200/80 mt-0.5 shadow-3xs">
                      {ord.codChangeDue && ord.codChangeDue > 0 ? `₹${ord.codChangeDue}` : 'Exact Cash'}
                    </span>
                  </div>
                </div>
              )}

              {/* Footer: Grand Total & Actions */}
              <div className="pt-3 border-t border-stone-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">Grand Total</span>
                    <span className="font-mono font-black text-base sm:text-lg text-stone-900">
                      ₹{ord.grandTotal}
                    </span>
                  </div>

                  {/* Primary Action Button or Dropdown Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ord.status === 'PLACED' && (
                      <>
                        <button
                          onClick={() => setRejectOrderId(ord.id)}
                          className="px-3 py-1.5 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 text-xs font-bold cursor-pointer transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleAccept(ord.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Accept
                        </button>
                      </>
                    )}

                    {ord.status === 'ACCEPTED' && (
                      <button
                        onClick={() => handlePrepare(ord.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                      >
                        <Utensils className="w-3.5 h-3.5" /> Start Preparing
                      </button>
                    )}

                    {ord.status === 'PREPARING' && (
                      <button
                        onClick={() => setReadyOrderId(ord.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Ready
                      </button>
                    )}

                    {ord.status === 'READY' && (
                      <div className="flex items-center gap-1">
                        {deliveryPartners.length === 0 ? (
                          <span className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1">
                            No delivery partner
                          </span>
                        ) : (
                          <PartnerAssignDropdown
                            orderId={ord.id}
                            deliveryPartners={deliveryPartners}
                            isAssigning={assigningOrderId === ord.id}
                            onSelect={handleSingleAssign}
                            variant="assign"
                          />
                        )}
                      </div>
                    )}

                    {ord.status === 'ASSIGNED' && (
                      <PartnerAssignDropdown
                        orderId={ord.id}
                        currentPartnerId={ord.assignedDeliveryPartnerId}
                        deliveryPartners={deliveryPartners}
                        isAssigning={assigningOrderId === ord.id}
                        onSelect={handleSingleAssign}
                        variant="reassign"
                      />
                    )}
                  </div>
                </div>

                {/* Dedicated Rider Banner (Shown when assigned, on the way, etc.) */}
                {['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(ord.status) && (() => {
                  const partner = getPartnerInfo(ord);
                  if (!partner) return null;
                  return (
                    <div className="flex items-center justify-between gap-2 p-2 px-2.5 bg-blue-50/80 border border-blue-200/70 rounded-xl text-xs shadow-3xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 text-[11px] font-bold">
                          🛵
                        </div>
                        <p className="text-blue-950 font-bold truncate">
                          Rider: <span className="font-extrabold text-blue-900">{partner.name}</span>
                        </p>
                      </div>
                      {partner.phone && (
                        <a
                          href={`tel:${partner.phone}`}
                          className="px-2.5 py-1 rounded-lg bg-white border border-blue-200/80 text-blue-700 hover:bg-blue-100 font-bold text-[11px] flex items-center gap-1 shrink-0 transition-colors shadow-3xs"
                          title={`Call ${partner.name}`}
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      {rejectOrderId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h3 className="font-bold text-stone-900 text-sm">Reject Order?</h3>
            <p className="text-xs text-stone-500">Select a reason for rejecting this customer order.</p>

            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-xl text-xs"
            >
              <option value="Kitchen busy with high order volume">Kitchen busy with high order volume</option>
              <option value="Item temporarily out of stock">Item temporarily out of stock</option>
              <option value="Restaurant closing soon">Restaurant closing soon</option>
            </select>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setRejectOrderId(null)}
                className="flex-1 py-2 rounded-xl border border-stone-300 text-xs font-bold text-stone-700"
              >
                Cancel
              </button>
              <button
                disabled={isRejecting}
                onClick={handleRejectSubmit}
                className="flex-1 py-2 rounded-xl bg-red-700 text-white text-xs font-bold"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Assignment Modal */}
      {showBatchModal && (
        <DeliveryBatchingModal
          readyOrders={readyOrders}
          availablePartners={deliveryPartners}
          onClose={() => setShowBatchModal(false)}
          onSuccess={loadData}
        />
      )}

      {/* Ready Order Modal */}
      {readyOrderId && (
        <ReadyOrderModal
          order={orders.find(o => o.id === readyOrderId)!}
          onClose={() => setReadyOrderId(null)}
          onConfirm={async () => {
             await handleReady(readyOrderId);
          }}
        />
      )}
    </div>
  );
};
