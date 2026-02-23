import React, { useState, useEffect } from 'react';
import { Plus, Edit2, X, Loader2, Package, Trash2 } from 'lucide-react';
import { mastersApi, gstApi } from '../lib/api';

const ActionButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
  >
    <Edit2 className="w-4 h-4" />
  </button>
);

const DeleteButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
  >
    <Trash2 className="w-4 h-4" />
  </button>
);

type MasterType = 'raw-material' | 'finished-product' | 'machine' | 'customer' | 'supplier' | 'expense' | 'general-item' | 'accounts' | 'employee' | 'cc-account';

// Indian States for Dropdown
// GST State Codes for Mapping
const GST_STATES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman & Diu' },
  { code: '26', name: 'Dadra & Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' }
];

export function Masters() {
  const [activeTab, setActiveTab] = useState<MasterType>('raw-material');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gstLoading, setGstLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // State for all masters
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<any[]>([]);
  const [generalItems, setGeneralItems] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [ccAccounts, setCCAccounts] = useState<any[]>([]); // New State
  const [employees, setEmployees] = useState<any[]>([]);

  const [formData, setFormData] = useState<any>({});

  // Fetch data on mount and tab change
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      let result;
      switch (activeTab) {
        case 'raw-material':
          result = await mastersApi.getRawMaterials();
          if (result.data) setRawMaterials(result.data);
          break;
        case 'finished-product':
          result = await mastersApi.getFinishedProducts();
          if (result.data) setFinishedProducts(result.data);
          break;
        case 'machine':
          result = await mastersApi.getMachines();
          if (result.data) setMachines(result.data);
          break;
        case 'customer':
          result = await mastersApi.getCustomers();
          if (result.data) setCustomers(result.data);
          break;
        case 'supplier':
          result = await mastersApi.getSuppliers();
          if (result.data) setSuppliers(result.data);
          break;
        case 'expense':
          result = await mastersApi.getExpenseHeads();
          if (result.data) setExpenseHeads(result.data);
          break;
        case 'accounts':
          result = await mastersApi.getAccounts();
          if (result.data) setAccounts(result.data);
          break;
        case 'cc-account':
          result = await mastersApi.getCCAccounts();
          if (result.data) setCCAccounts(result.data);
          break;
        case 'employee':
          result = await mastersApi.getEmployees();
          if (result.data) setEmployees(result.data);
          break;
        case 'general-item':
          result = await mastersApi.getGeneralItems();
          if (result.data) setGeneralItems(result.data);
          break;
      }
      if (result?.error) setError(result.error);
    } catch (err) {
      setError('Failed to fetch data');
    }

    setLoading(false);
  };

  const getEmptyForm = (type: MasterType) => {
    switch (type) {
      case 'raw-material':
        return { name: '', size: 'Standard', color: '', unit: 'kg', hsnCode: '3901', gstPercent: '18', reorderLevel: '100' };
      case 'finished-product':
        return { name: '', length: '', width: '', gsm: '', unit: 'kg', hsnCode: '60059000', gstPercent: '5', ratePerKg: '0' };
      case 'machine':
        return { name: '', type: 'Net Extrusion', capacity: '', status: 'Active' };
      case 'customer':
        return { name: '', gstNo: '', stateCode: '24', email: '', phone: '', address: '', outstanding: 0 };
      case 'supplier':
        return { name: '', gstNo: '', stateCode: '24', contact: '', address: '', outstanding: 0 };
      case 'expense':
        return { name: '', category: 'Variable' };
      case 'accounts':
        return { name: '', accountNo: '', type: 'Bank', balance: '' };
      case 'cc-account':
        return {
          name: '',
          accountNo: '',
          sanctionedLimit: '',
          interestRate: '',
          drawingPowerMode: 'Automatic',
          stockMargin: '25',
          receivablesMargin: '40',
          securityType: 'Hypothecation',
          validityPeriod: ''
        };
      case 'employee':
        return { name: '', designation: '', contact: '', salary: '' };
      case 'general-item':
        return { name: '', defaultExpenseHeadId: '' };
      default:
        return {};
    }
  };

  const handleAddNew = () => {
    setShowAddForm(true);
    setEditingItem(null);
    setFormData(getEmptyForm(activeTab));
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setShowAddForm(true);
    setFormData({ ...item });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      let result;
      switch (activeTab) {
        case 'raw-material':
          result = editingItem
            ? await mastersApi.updateRawMaterial(editingItem.id, formData)
            : await mastersApi.createRawMaterial(formData);
          break;
        case 'finished-product':
          result = editingItem
            ? await mastersApi.updateFinishedProduct(editingItem.id, formData)
            : await mastersApi.createFinishedProduct(formData);
          break;
        case 'machine':
          result = editingItem
            ? await mastersApi.updateMachine(editingItem.id, formData)
            : await mastersApi.createMachine(formData);
          break;
        case 'customer':
          result = editingItem
            ? await mastersApi.updateCustomer(editingItem.id, formData)
            : await mastersApi.createCustomer(formData);
          break;
        case 'supplier':
          result = editingItem
            ? await mastersApi.updateSupplier(editingItem.id, formData)
            : await mastersApi.createSupplier(formData);
          break;
        case 'expense':
          result = editingItem
            ? await mastersApi.updateExpenseHead(editingItem.id, formData)
            : await mastersApi.createExpenseHead(formData);
          break;
        case 'accounts':
          result = editingItem
            ? await mastersApi.updateAccount(editingItem.id, formData)
            : await mastersApi.createAccount(formData);
          break;
        case 'cc-account':
          // Only Create is supported properly via specialized route?
          // Actually createCCAccount route exists. Update not explicit in `api.ts` or `cc-accounts.ts`.
          // I'll assume only Create for now or use generic update logic if I added it.
          // I didn't add updateCCAccount.
          // So if editingItem, I might fail or need to add it.
          // Let's support Create only for now, or fallback to error.
          // "CC Account Setup" usually implies Create. updates normally done by admin directly or I need to add PUT.
          if (editingItem) {
            // Fallback to error or simple account update?
            // CC Details are complex.
            setError('Update not implemented for CC Accounts yet.');
            setSaving(false);
            return;
          }
          result = await mastersApi.createCCAccount(formData);
          break;
        case 'employee':
          result = editingItem
            ? await mastersApi.updateEmployee(editingItem.id, formData)
            : await mastersApi.createEmployee(formData);
          break;
        case 'general-item':
          result = editingItem
            ? await mastersApi.updateGeneralItem(editingItem.id, formData)
            : await mastersApi.createGeneralItem(formData);
          break;
      }

      if (result?.error) {
        setError(result.error);
      } else {
        setShowAddForm(false);
        setEditingItem(null);
        fetchData(); // Refresh data
      }
    } catch (err) {
      setError('Failed to save');
    }

    setSaving(false);
  };



  const handleGstSearch = async () => {
    const gstin = formData.gstNo;
    if (!gstin || gstin.length !== 15) return;

    setGstLoading(true);
    setSuccessMsg(null);
    setError(null);

    try {
      const result = await gstApi.search(gstin);
      if (result.data) {
        const gstinPrefix = gstin.substring(0, 2);
        const stateCode = /^\d{2}$/.test(gstinPrefix) ? gstinPrefix : result.data.stateCode;

        setFormData((prev: any) => ({
          ...prev,
          name: result.data.name,
          stateCode: stateCode,
          address: result.data.address,
          gstVerifiedAt: result.data.gstVerifiedAt
        }));
        setSuccessMsg('GST details fetched successfully.');
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(result.error || 'Unable to fetch GST details. Please verify GST number or enter details manually.');
      }
    } catch (err) {
      setError('Unable to fetch GST details. Please verify GST number or enter details manually.');
    } finally {
      setGstLoading(false);
    }
  };

  const renderForm = () => {
    switch (activeTab) {
      case 'raw-material':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Material Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Size</label>
              <input type="text" value={formData.size || ''} onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color *</label>
              <input type="text" value={formData.color || ''} onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code</label>
              <input type="text" value={formData.hsnCode || ''} onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST %</label>
              <select value={formData.gstPercent || '18'} onChange={(e) => setFormData({ ...formData, gstPercent: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reorder Level (kg)</label>
              <input type="number" value={formData.reorderLevel || ''} onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case 'finished-product':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Length (m)</label>
              <input type="text" value={formData.length || ''} onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Width (m)</label>
              <input type="text" value={formData.width || ''} onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shade</label>
              <input type="text" value={formData.gsm || ''} onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code</label>
              <input type="text" value={formData.hsnCode || ''} onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Selling Rate/kg (₹)</label>
              <input type="number" step="0.01" value={formData.ratePerKg || ''} onChange={(e) => setFormData({ ...formData, ratePerKg: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST %</label>
              <select value={formData.gstPercent || '18'} onChange={(e) => setFormData({ ...formData, gstPercent: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
          </div>
        );

      case 'machine':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Machine Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <input type="text" value={formData.type || ''} onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Capacity</label>
              <input type="text" value={formData.capacity || ''} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                placeholder="e.g., 100 kg/day"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select value={formData.status || 'Active'} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option>Active</option>
                <option>Inactive</option>
                <option>Maintenance</option>
              </select>
            </div>
          </div>
        );

      case 'customer':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.gstNo || ''}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    if (value.length >= 2) {
                      const prefix = value.substring(0, 2);
                      if (/^\d{2}$/.test(prefix)) {
                        setFormData((prev: any) => ({ ...prev, gstNo: value, stateCode: prefix }));
                      } else {
                        setFormData({ ...formData, gstNo: value });
                      }
                    } else {
                      setFormData({ ...formData, gstNo: value });
                    }
                  }}
                  onBlur={handleGstSearch}
                  maxLength={15}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${gstLoading ? 'bg-slate-50 border-blue-200' : 'border-gray-300'}`}
                  placeholder="Enter GSTIN"
                />
                {gstLoading && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
              <input type="text" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
              <select value={formData.stateCode || '24'}
                onChange={(e) => setFormData({ ...formData, stateCode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                {GST_STATES.map((state) => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <textarea value={formData.address || ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case 'supplier':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Supplier Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.gstNo || ''}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    if (value.length >= 2) {
                      const prefix = value.substring(0, 2);
                      if (/^\d{2}$/.test(prefix)) {
                        setFormData((prev: any) => ({ ...prev, gstNo: value, stateCode: prefix }));
                      } else {
                        setFormData({ ...formData, gstNo: value });
                      }
                    } else {
                      setFormData({ ...formData, gstNo: value });
                    }
                  }}
                  onBlur={handleGstSearch}
                  maxLength={15}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${gstLoading ? 'bg-slate-50 border-blue-200' : 'border-gray-300'}`}
                  placeholder="Enter GSTIN"
                />
                {gstLoading && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact *</label>
              <input type="text" value={formData.contact || ''} onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
              <select value={formData.stateCode || '24'}
                onChange={(e) => setFormData({ ...formData, stateCode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                {GST_STATES.map((state) => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <textarea value={formData.address || ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case 'expense':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expense Head *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select value={formData.category || 'Variable'} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option>Fixed</option>
                <option>Variable</option>
                <option>Personnel</option>
                <option>Utility</option>
              </select>
            </div>
          </div>
        );

      case 'accounts':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
              <input type="text" value={formData.accountNo || ''} onChange={(e) => setFormData({ ...formData, accountNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select value={formData.type || 'Bank'} onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option>Bank</option>
                <option>Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Opening Balance (₹)</label>
              <input type="number" step="0.01" value={formData.balance || ''} onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case 'cc-account':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 bg-blue-50 p-3 rounded-lg text-sm text-blue-700 border border-blue-100 flex items-start">
              <div className="mr-2 mt-0.5">ℹ️</div>
              <div>
                <strong>Cash Credit (Working Capital) Account</strong><br />
                Funds utilized from this account are treated as a Liability. Interest is calculated daily on the outstanding amount.
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Name (Alias) *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="e.g. HDFC CC A/c" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Number *</label>
              <input type="text" value={formData.accountNo || ''} onChange={(e) => setFormData({ ...formData, accountNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sanctioned Limit (₹) *</label>
              <input type="number" value={formData.sanctionedLimit || ''} onChange={(e) => setFormData({ ...formData, sanctionedLimit: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Interest Rate (% p.a.) *</label>
              <input type="number" step="0.01" value={formData.interestRate || ''} onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Drawing Power Mode</label>
              <select value={formData.drawingPowerMode || 'Automatic'} onChange={(e) => setFormData({ ...formData, drawingPowerMode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="Automatic">Automatic (Stock + Debtors)</option>
                <option value="Manual">Manual (Limit Based)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Validity Period</label>
              <input type="date" value={formData.validityPeriod ? new Date(formData.validityPeriod).toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, validityPeriod: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>

            {formData.drawingPowerMode === 'Automatic' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stock Margin (%)</label>
                  <input type="number" value={formData.stockMargin || ''} onChange={(e) => setFormData({ ...formData, stockMargin: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Default 25%" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Receivables Margin (%)</label>
                  <input type="number" value={formData.receivablesMargin || ''} onChange={(e) => setFormData({ ...formData, receivablesMargin: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Default 40%" />
                </div>
              </>
            )}
          </div>
        );

      case 'employee':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Employee Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Designation *</label>
              <input type="text" value={formData.designation || ''} onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact *</label>
              <input type="text" value={formData.contact || ''} onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Salary (₹/month) *</label>
              <input type="number" value={formData.salary || ''} onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case 'general-item':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Item Name *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Default Expense Head</label>
              <select value={formData.defaultExpenseHeadId || ''} onChange={(e) => setFormData({ ...formData, defaultExpenseHeadId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">None (Select at purchase)</option>
                {expenseHeads.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getFormTitle = () => {
    const titles = {
      'raw-material': 'Raw Material',
      'finished-product': 'Finished Product',
      'machine': 'Machine',
      'customer': 'Customer',
      'supplier': 'Supplier',
      'expense': 'Expense Head',
      'general-item': 'General Item',
      'accounts': 'Bank/Cash Account',
      'cc-account': 'Cash Credit Account',
      'employee': 'Employee'
    };
    return `${editingItem ? 'Edit' : 'Add New'} ${titles[activeTab as keyof typeof titles]}`;
  };

  const renderTable = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
          <span className="text-sm font-medium">Loading Records...</span>
        </div>
      );
    }

    const TableHeader = ({ children }: { children: React.ReactNode }) => (
      <thead className="bg-slate-50/80 backdrop-blur border-b border-slate-100 sticky top-0 z-10">
        <tr>{children}</tr>
      </thead>
    );

    const Th = ({ children }: { children: React.ReactNode }) => (
      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{children}</th>
    );

    const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
      <td className={`px-6 py-4 text-sm text-slate-600 border-b border-slate-50 last:border-0 ${className}`}>{children}</td>
    );

    const ActionButton = ({ onClick }: { onClick: () => void }) => (
      <button onClick={onClick} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
        <Edit2 className="w-4 h-4" />
      </button>
    );

    const getItems = () => {
      switch (activeTab) {
        case 'raw-material': return rawMaterials;
        case 'finished-product': return finishedProducts;
        case 'machine': return machines;
        case 'customer': return customers;
        case 'supplier': return suppliers;
        case 'expense': return expenseHeads;
        case 'accounts': return accounts;
        case 'employee': return employees;
        case 'cc-account': return ccAccounts;
        case 'general-item': return generalItems;
        default: return [];
      }
    };

    const items = getItems();

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-slate-200" />
          </div>
          <p className="text-lg font-medium text-slate-600">No records found</p>
          <p className="text-sm mt-1">Click "Add New" to get started.</p>
        </div>
      );
    }

    const handleDelete = async (type: MasterType, id: string) => {
      if (!confirm('Are you sure you want to delete this item?')) return;

      setLoading(true);
      try {
        let result;
        switch (type) {
          case 'raw-material':
            result = await mastersApi.deleteRawMaterial(id);
            break;
          case 'finished-product':
            result = await mastersApi.deleteFinishedProduct(id);
            break;
          case 'machine':
            result = await mastersApi.deleteMachine(id);
            break;
          case 'customer':
            result = await mastersApi.deleteCustomer(id);
            break;
          case 'supplier':
            result = await mastersApi.deleteSupplier(id);
            break;
          case 'accounts':
            if (confirm('Warning: Deleting this account will also revert/delete all associated transactions (payments, receipts, expenses). This action cannot be undone. \n\nAre you absolutely sure?')) {
              result = await mastersApi.deleteAccount(id);
            } else {
              setLoading(false);
              return;
            }
            break;
          case 'cc-account':
            if (confirm('Warning: Deleting this CC account will also revert/delete all associated transactions. This action cannot be undone. \n\nAre you absolutely sure?')) {
              result = await mastersApi.deleteCCAccount(id);
            } else {
              setLoading(false);
              return;
            }
            break;
          case 'general-item':
            result = await mastersApi.deleteGeneralItem(id);
            break;
          case 'expense':
            result = await mastersApi.deleteExpenseHead(id);
            break;
          case 'employee':
            result = await mastersApi.deleteEmployee(id);
            break;
        }

        if (result?.error) {
          setError(result.error);
        } else {
          await fetchData();
        }
      } catch (err) {
        setError('Failed to delete item');
      }
      setLoading(false);
    };

    switch (activeTab) {
      case 'raw-material':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Name</Th>
              <Th>HSN</Th>
              <Th>Color</Th>
              <Th>Stock</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {rawMaterials.map((rm) => (
                <tr key={rm.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{rm.code}</Td>
                  <Td className="font-medium text-slate-900">{rm.name}</Td>
                  <Td>{rm.hsnCode}</Td>
                  <Td>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full border border-slate-200 shadow-sm" style={{ backgroundColor: rm.color }} />
                      <span>{rm.color}</span>
                    </div>
                  </Td>
                  <Td className="font-medium text-slate-900">{rm.stock} kg</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(rm)} />
                      <DeleteButton onClick={() => handleDelete('raw-material', rm.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'finished-product':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Product Name</Th>
              <Th>Dimensions</Th>
              <Th>HSN / GST</Th>
              <Th>Stock</Th>
              <Th>Rate</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {finishedProducts.map((fp) => (
                <tr key={fp.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{fp.code}</Td>
                  <Td className="font-medium text-slate-900">{fp.name}</Td>
                  <Td className="text-slate-500">{fp.length} x {fp.width} <span className="text-xs text-slate-400">({fp.gsm} Shade)</span></Td>
                  <Td>{fp.hsnCode} <span className="text-slate-300 mx-1">/</span> {fp.gstPercent}%</Td>
                  <Td className="font-medium text-slate-900">{fp.stock} kg</Td>
                  <Td>₹{fp.ratePerKg}</Td>
                  <Td>
                    <div className="flex items-center space-x-1">
                      <ActionButton onClick={() => handleEdit(fp)} />
                      <DeleteButton onClick={() => handleDelete('finished-product', fp.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'machine':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Capacity</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {machines.map((machine) => (
                <tr key={machine.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{machine.code}</Td>
                  <Td className="font-medium text-slate-900">{machine.name}</Td>
                  <Td>{machine.type}</Td>
                  <Td>{machine.capacity}</Td>
                  <Td>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${machine.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {machine.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>}
                      {machine.status}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(machine)} />
                      <DeleteButton onClick={() => handleDelete('machine', machine.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'customer':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Customer</Th>
              <Th>GST No</Th>
              <Th>Contact</Th>
              <Th>State</Th>
              <Th>Outstanding</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{customer.code}</Td>
                  <Td>
                    <div className="font-medium text-slate-900">{customer.name}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[200px]">{customer.address}</div>
                  </Td>
                  <Td className="font-mono text-xs">{customer.gstNo}</Td>
                  <Td>
                    <div className="text-slate-600">{customer.phone}</div>
                    <div className="text-xs text-slate-400">{customer.email}</div>
                  </Td>
                  <Td>{GST_STATES.find(s => s.code === customer.stateCode)?.name || customer.stateCode}</Td>
                  <Td className="font-medium">
                    {parseFloat(customer.outstanding || 0) > 0 ? (
                      <span className="text-amber-600">₹{parseFloat(customer.outstanding).toLocaleString()}</span>
                    ) : (
                      <span className="text-slate-400">₹0</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(customer)} />
                      <DeleteButton onClick={() => handleDelete('customer', customer.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'supplier':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Supplier</Th>
              <Th>GST No</Th>
              <Th>Contact</Th>
              <Th>Address</Th>
              <Th>Outstanding</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{supplier.code}</Td>
                  <Td className="font-medium text-slate-900">{supplier.name}</Td>
                  <Td className="font-mono text-xs">{supplier.gstNo}</Td>
                  <Td>{supplier.contact}</Td>
                  <Td className="max-w-xs truncate text-xs">{supplier.address}</Td>
                  <Td className="font-medium">
                    {parseFloat(supplier.outstanding || 0) > 0 ? (
                      <span className="text-red-600">₹{parseFloat(supplier.outstanding).toLocaleString()}</span>
                    ) : (
                      <span className="text-slate-400">₹0</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(supplier)} />
                      <DeleteButton onClick={() => handleDelete('supplier', supplier.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'expense':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Expense Head</Th>
              <Th>Category</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {expenseHeads.map((expense) => (
                <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{expense.code}</Td>
                  <Td className="font-medium text-slate-900">{expense.name}</Td>
                  <Td>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {expense.category}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(expense)} />
                      <DeleteButton onClick={() => handleDelete('expense', expense.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'accounts':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Account Name</Th>
              <Th>Details</Th>
              <Th>Type</Th>
              <Th>Balance</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{account.code}</Td>
                  <Td className="font-medium text-slate-900">{account.name}</Td>
                  <Td className="font-mono text-xs text-slate-500">{account.accountNo || '-'}</Td>
                  <Td>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${account.type === 'Bank' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {account.type}
                    </span>
                  </Td>
                  <Td className="font-medium text-slate-900">
                    ₹{parseFloat(account.balance || 0).toLocaleString()}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(account)} />
                      <DeleteButton onClick={() => handleDelete('accounts', account.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'cc-account':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Account Info</Th>
              <Th>Limit & DP</Th>
              <Th>Outstanding</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {ccAccounts.map((cc) => (
                <tr key={cc.accountId || cc.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{cc.code}</Td>
                  <Td>
                    <div className="font-medium text-slate-900">{cc.name}</div>
                    <div className="text-xs text-slate-500">{cc.accountNo}</div>
                    <div className="text-xs text-blue-600 mt-0.5">{cc.interestRate}% Int. Rate</div>
                  </Td>
                  <Td>
                    <div className="text-xs text-slate-500">Limit: <span className="font-medium text-slate-900">₹{parseFloat(cc.sanctionedLimit || '0').toLocaleString()}</span></div>
                    {cc.drawingPowerMode === 'Automatic' && (
                      <div className="text-xs text-emerald-600 mt-0.5">DP: Auto (Stock-Margin)</div>
                    )}
                    {cc.drawingPowerMode === 'Manual' && (
                      <div className="text-xs text-amber-600 mt-0.5">DP: Manual (Limit)</div>
                    )}
                  </Td>
                  <Td>
                    <div className="font-medium text-red-600">
                      ₹{Math.abs(parseFloat(cc.balance || '0')).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">Utilized</div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(cc)} />
                      <DeleteButton onClick={() => handleDelete('cc-account', cc.accountId || cc.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'employee':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>ID</Th>
              <Th>Employee</Th>
              <Th>Designation</Th>
              <Th>Contact</Th>
              <Th>Salary</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-mono text-slate-400 text-xs">{employee.code}</Td>
                  <Td className="font-medium text-slate-900">{employee.name}</Td>
                  <Td className="text-slate-600">{employee.designation}</Td>
                  <Td>{employee.contact}</Td>
                  <Td className="font-medium text-slate-900">
                    ₹{parseFloat(employee.salary || 0).toLocaleString()}<span className="text-xs text-slate-400 font-normal">/mo</span>
                  </Td>
                  <Td><ActionButton onClick={() => handleEdit(employee)} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'general-item':
        return (
          <table className="w-full text-left border-collapse">
            <TableHeader>
              <Th>Name</Th>
              <Th>Default Expense Head</Th>
              <Th>Actions</Th>
            </TableHeader>
            <tbody className="bg-white">
              {generalItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                  <Td className="font-medium text-slate-900">{item.name}</Td>
                  <Td>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${item.defaultExpenseHead ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {item.defaultExpenseHead?.name || 'N/A'}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => handleEdit(item)} />
                      <DeleteButton onClick={() => handleDelete('general-item', item.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar: Tabs & Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
        {/* Segmented Control Tabs */}
        <div className="flex p-1 bg-slate-100/80 rounded-xl overflow-x-auto max-w-full no-scrollbar">
          {[
            { id: 'raw-material', label: 'Raw Materials' },
            { id: 'finished-product', label: 'Finished Goods' },
            { id: 'machine', label: 'Machines' },
            { id: 'customer', label: 'Customers' },
            { id: 'supplier', label: 'Suppliers' },
            { id: 'expense', label: 'Expenses' },
            { id: 'accounts', label: 'Accounts' },
            { id: 'cc-account', label: 'CC Accounts' },
            { id: 'employee', label: 'Employees' },
            { id: 'general-item', label: 'General Items' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as MasterType)}
              className={`
                whitespace-nowrap px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleAddNew}
          className="flex-shrink-0 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-black transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center space-x-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add New</span>
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-xl flex items-center animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {successMsg}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border border-white/20 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <h2 className="text-lg font-semibold text-slate-800">{getFormTitle()}</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="p-6 overflow-y-auto bg-white">
              {renderForm()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50 disabled:shadow-none flex items-center space-x-2 font-medium text-sm"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingItem ? 'Update Changes' : 'Save Record'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
        {renderTable()}
      </div>
    </div>
  );
}