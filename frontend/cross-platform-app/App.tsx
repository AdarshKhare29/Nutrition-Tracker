import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

const TOKEN_KEY = 'calorie_tracker_token';
const API_BASE_KEY = 'calorie_tracker_api_base';
const TARGET_CAL_KEY = 'calorie_tracker_target_calories';
const TARGET_PROTEIN_KEY = 'calorie_tracker_target_protein';
const DEFAULT_API_BASE = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';
const MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner'];

function formatDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function Input({ label = '', hideLabel = false, containerStyle = null, inputStyle = null, ...props }) {
  return (
    <View style={[styles.inputGroup, containerStyle]}>
      {!hideLabel ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput style={[styles.input, inputStyle]} placeholderTextColor="#7b8794" {...props} />
    </View>
  );
}

function Button({ title, onPress, variant = 'primary', disabled = false, style = null, textStyle = null }) {
  return (
    <Pressable
      style={[
        styles.button,
        variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary,
        disabled && styles.buttonDisabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.buttonText, variant === 'secondary' ? styles.buttonTextSecondary : styles.buttonTextPrimary, textStyle]}>
        {title}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const isWeb = Platform.OS === 'web';
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [apiDraft, setApiDraft] = useState(DEFAULT_API_BASE);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [adminView, setAdminView] = useState<'foods' | 'entries'>('foods');
  const [webTab, setWebTab] = useState<'home' | 'meals' | 'stats' | 'profile'>('home');
  const [mealSearch, setMealSearch] = useState('');
  const [showSearchAddModal, setShowSearchAddModal] = useState(false);
  const [searchSelectedFood, setSearchSelectedFood] = useState<any | null>(null);
  const [searchMealType, setSearchMealType] = useState('breakfast');
  const [searchQuantity, setSearchQuantity] = useState('1');
  const [modalFoodQuery, setModalFoodQuery] = useState('');

  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  const [authStatus, setAuthStatus] = useState('');
  const [errorText, setErrorText] = useState('');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [foods, setFoods] = useState([]);

  const [foodName, setFoodName] = useState('');
  const [foodUnit, setFoodUnit] = useState('');
  const [foodCalories, setFoodCalories] = useState('');
  const [foodProtein, setFoodProtein] = useState('');
  const [foodStatus, setFoodStatus] = useState('');
  const [editingFoodId, setEditingFoodId] = useState(null);
  const [editFoodName, setEditFoodName] = useState('');
  const [editFoodUnit, setEditFoodUnit] = useState('');
  const [editFoodCalories, setEditFoodCalories] = useState('');
  const [editFoodProtein, setEditFoodProtein] = useState('');

  const [entryDate, setEntryDate] = useState(formatDate());
  const [entryMealType, setEntryMealType] = useState('breakfast');
  const [entryFoodId, setEntryFoodId] = useState('');
  const [entryQuantity, setEntryQuantity] = useState('1');
  const [entryStatus, setEntryStatus] = useState('');
  const [showFoodPicker, setShowFoodPicker] = useState(false);

  const [summaryDate, setSummaryDate] = useState(formatDate());
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [entries, setEntries] = useState([]);
  const [targetCalories, setTargetCalories] = useState('2200');
  const [targetProtein, setTargetProtein] = useState('120');

  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editMealType, setEditMealType] = useState('');
  const [editFoodId, setEditFoodId] = useState('');
  const [editQuantity, setEditQuantity] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const selectedFood = foods.find((food) => String(food.id) === String(entryFoodId));

  function mealTitle(meal: string) {
    return meal.charAt(0).toUpperCase() + meal.slice(1);
  }

  function openAddMealModal(defaultMeal?: string) {
    setShowSearchAddModal(true);
    setSearchSelectedFood(null);
    setSearchMealType(defaultMeal || entryMealType || 'breakfast');
    setSearchQuantity('1');
    setModalFoodQuery(mealSearch);
  }

  async function saveTargets() {
    await AsyncStorage.setItem(TARGET_CAL_KEY, targetCalories || '2200');
    await AsyncStorage.setItem(TARGET_PROTEIN_KEY, targetProtein || '120');
  }

  async function api(path, options: RequestInit & { headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers
    });

    const body = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        await clearSession();
      }
      throw new Error(body.error || 'Request failed');
    }

    return body;
  }

  async function clearSession() {
    setToken('');
    setCurrentUser(null);
    setFoods([]);
    setSummary(null);
    setHistory([]);
    setEntries([]);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }

  async function persistApiBase(nextBase) {
    setApiBase(nextBase);
    setApiDraft(nextBase);
    await AsyncStorage.setItem(API_BASE_KEY, nextBase);
    setAuthStatus(`API Base set to ${nextBase}`);
  }

  async function loadPrivateData(activeToken = token) {
    setLoadingData(true);
    setErrorText('');
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`
      };

      const [foodsRes, summaryRes, historyRes, entriesRes] = await Promise.all([
        fetch(`${apiBase}/api/foods`, { headers }),
        fetch(`${apiBase}/api/summary?date=${summaryDate}`, { headers }),
        fetch(`${apiBase}/api/history`, { headers }),
        fetch(`${apiBase}/api/entries?date=${summaryDate}`, { headers })
      ]);

      const foodsBody = await foodsRes.json();
      const summaryBody = await summaryRes.json();
      const historyBody = await historyRes.json();
      let entriesBody: any = {};
      try {
        entriesBody = await entriesRes.json();
      } catch (_error) {
        entriesBody = [];
      }

      if (!foodsRes.ok) throw new Error(foodsBody.error || 'Failed to load foods');
      if (!summaryRes.ok) throw new Error(summaryBody.error || 'Failed to load summary');
      if (!historyRes.ok) throw new Error(historyBody.error || 'Failed to load history');
      // Keep app usable even if an older backend is running without /api/entries.
      if (!entriesRes.ok && entriesRes.status !== 404) {
        throw new Error((entriesBody && entriesBody.error) || 'Failed to load entries');
      }

      setFoods(foodsBody);
      setSummary(summaryBody);
      setHistory(historyBody);
      setEntries(entriesBody);

      if (foodsBody.length > 0 && !entryFoodId) {
        setEntryFoodId(String(foodsBody[0].id));
      }
    } catch (error) {
      setErrorText(error.message);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleLogin() {
    setErrorText('');
    setAuthStatus('');

    try {
      const login = await fetch(`${apiBase}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      const body = await login.json();

      if (!login.ok) {
        throw new Error(body.error || 'Login failed');
      }

      setToken(body.token);
      setCurrentUser(body.user);
      await AsyncStorage.setItem(TOKEN_KEY, body.token);
      setAuthStatus(`Logged in as ${body.user.username} (${body.user.role})`);
      setLoginUsername('');
      setLoginPassword('');
      await loadPrivateData(body.token);
    } catch (error) {
      setErrorText(error.message);
    }
  }

  async function handleLogout() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (_error) {
      // local clear still happens
    }

    await clearSession();
    setAuthStatus('Logged out');
  }

  async function handleAddFood() {
    try {
      await api('/api/foods', {
        method: 'POST',
        body: JSON.stringify({
          name: foodName,
          unit: foodUnit,
          calories: Number(foodCalories),
          protein: Number(foodProtein)
        })
      });

      setFoodName('');
      setFoodUnit('');
      setFoodCalories('');
      setFoodProtein('');
      setFoodStatus('Food added successfully');
      await loadPrivateData();
    } catch (error) {
      setFoodStatus(error.message);
    }
  }

  function startFoodEdit(food) {
    setEditingFoodId(food.id);
    setEditFoodName(food.name);
    setEditFoodUnit(food.unit);
    setEditFoodCalories(String(food.calories));
    setEditFoodProtein(String(food.protein));
  }

  function cancelFoodEdit() {
    setEditingFoodId(null);
    setEditFoodName('');
    setEditFoodUnit('');
    setEditFoodCalories('');
    setEditFoodProtein('');
  }

  async function saveFoodEdit() {
    try {
      await api(`/api/foods/${editingFoodId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editFoodName,
          unit: editFoodUnit,
          calories: Number(editFoodCalories),
          protein: Number(editFoodProtein)
        })
      });
      setFoodStatus('Food item updated');
      cancelFoodEdit();
      await loadPrivateData();
    } catch (error) {
      setFoodStatus(error.message);
    }
  }

  async function deleteFood(foodId) {
    try {
      await api(`/api/foods/${foodId}`, { method: 'DELETE' });
      if (editingFoodId === foodId) {
        cancelFoodEdit();
      }
      setFoodStatus('Food item deleted');
      await loadPrivateData();
    } catch (error) {
      setFoodStatus(error.message);
    }
  }

  async function handleAddEntry() {
    try {
      await api('/api/entries', {
        method: 'POST',
        body: JSON.stringify({
          date: entryDate,
          mealType: entryMealType,
          foodId: Number(entryFoodId),
          quantity: Number(entryQuantity)
        })
      });

      setEntryStatus('Meal entry added');
      await loadPrivateData();
    } catch (error) {
      setEntryStatus(error.message);
    }
  }

  async function handleAddFromSearchModal() {
    if (!searchSelectedFood) return;
    try {
      await api('/api/entries', {
        method: 'POST',
        body: JSON.stringify({
          date: summaryDate,
          mealType: searchMealType,
          foodId: Number(searchSelectedFood.id),
          quantity: Number(searchQuantity)
        })
      });
      setEntryStatus('Meal entry added');
      setShowSearchAddModal(false);
      setSearchSelectedFood(null);
      setMealSearch('');
      setModalFoodQuery('');
      await loadPrivateData();
    } catch (error) {
      setEntryStatus(error.message);
    }
  }

  function startEdit(entry) {
    setEditingEntryId(entry.id);
    setEditDate(entry.date);
    setEditMealType(entry.mealType);
    setEditFoodId(String(entry.foodId));
    setEditQuantity(String(entry.quantity));
  }

  function cancelEdit() {
    setEditingEntryId(null);
    setEditDate('');
    setEditMealType('');
    setEditFoodId('');
    setEditQuantity('');
  }

  async function saveEdit() {
    try {
      await api(`/api/entries/${editingEntryId}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: editDate,
          mealType: editMealType,
          foodId: Number(editFoodId),
          quantity: Number(editQuantity)
        })
      });

      setEntryStatus('Meal entry updated');
      cancelEdit();
      await loadPrivateData();
    } catch (error) {
      setEntryStatus(error.message);
    }
  }

  async function deleteEntry(id) {
    try {
      await api(`/api/entries/${id}`, { method: 'DELETE' });
      setEntryStatus('Meal entry deleted');
      if (editingEntryId === id) cancelEdit();
      await loadPrivateData();
    } catch (error) {
      setEntryStatus(error.message);
    }
  }

  async function handleRefreshSummary() {
    try {
      const nextSummary = await api(`/api/summary?date=${summaryDate}`);
      setSummary(nextSummary);
      const nextEntries = await api(`/api/entries?date=${summaryDate}`);
      setEntries(nextEntries);
    } catch (error) {
      setErrorText(error.message);
    }
  }

  async function handleRefreshHistory() {
    try {
      const nextHistory = await api('/api/history');
      setHistory(nextHistory);
    } catch (error) {
      setErrorText(error.message);
    }
  }

  useEffect(() => {
    (async () => {
      const [savedToken, savedApiBase] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(API_BASE_KEY)
      ]);
      const [savedTargetCalories, savedTargetProtein] = await Promise.all([
        AsyncStorage.getItem(TARGET_CAL_KEY),
        AsyncStorage.getItem(TARGET_PROTEIN_KEY)
      ]);
      setTargetCalories(savedTargetCalories || '2200');
      setTargetProtein(savedTargetProtein || '120');

      const activeBase = savedApiBase || DEFAULT_API_BASE;
      setApiBase(activeBase);
      setApiDraft(activeBase);

      if (!savedToken) {
        setLoadingSession(false);
        return;
      }

      setToken(savedToken);

      try {
        const response = await fetch(`${activeBase}/api/me`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${savedToken}`
          }
        });

        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || 'Session expired');
        }

        setCurrentUser(body);
        setAuthStatus(`Logged in as ${body.username} (${body.role})`);
      } catch (_error) {
        await clearSession();
      } finally {
        setLoadingSession(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (token && currentUser) {
      loadPrivateData(token);
    }
  }, [summaryDate, token, currentUser]);

  function renderWebUserView() {
    const filteredMeals = MEAL_TYPES;
    const modalQuery = modalFoodQuery.trim().toLowerCase();
    const modalFoods = modalQuery ? foods.filter((food) => `${food.name} ${food.unit}`.toLowerCase().includes(modalQuery)) : foods;
    const totalCalories = summary?.totals?.calories || 0;
    const totalProtein = summary?.totals?.protein || 0;

    if (webTab === 'home') {
      return (
        <>
          <View style={[styles.webHeaderRow, styles.webHeaderRowOverlay]}>
            <View>
              <Text style={styles.webTitle}>Welcome back, {currentUser?.username}!</Text>
              <Text style={styles.subtitle}>Track your meals and stay healthy</Text>
            </View>
            <View style={styles.webHeaderActions}>
              <Button title="Notifications" variant="secondary" onPress={() => {}} />
              <Button title="Settings" variant="secondary" onPress={() => setShowApiSettings((prev) => !prev)} />
            </View>
          </View>

          <View style={styles.webGrid2}>
            <View style={[styles.card, styles.webCol]}>
              <Text style={styles.sectionTitle}>Today's Summary</Text>
              <Text style={styles.helperText}>{summaryDate}</Text>
              <View style={styles.webStatGrid}>
                <View style={[styles.webStatCard, styles.webStatCol]}>
                  <Text style={styles.helperText}>Calories</Text>
                  <Text style={styles.webMetric}>{totalCalories}</Text>
                  <Text style={styles.helperText}>of {targetCalories} kcal</Text>
                </View>
                <View style={[styles.webStatCard, styles.webStatCol]}>
                  <Text style={styles.helperText}>Protein</Text>
                  <Text style={styles.webMetric}>{totalProtein}g</Text>
                  <Text style={styles.helperText}>of {targetProtein}g</Text>
                </View>
                <View style={[styles.webStatCard, styles.webStatCol]}>
                  <Text style={styles.helperText}>Carbs</Text>
                  <Text style={styles.webMetric}>{Math.round(totalCalories * 0.45 * 0.25)}g</Text>
                  <Text style={styles.helperText}>of 200g</Text>
                </View>
              </View>
              <Text style={styles.sectionTitle}>Today's Meals</Text>
              {MEAL_TYPES.map((meal) => {
                const mealCal = summary?.byMeal?.[meal]?.calories || 0;
                const names = (summary?.byMeal?.[meal]?.items || []).map((it) => it.foodName).join(', ');
                return (
                  <View key={meal} style={styles.webMealItem}>
                    <View>
                      <Text style={styles.listRow}>{mealTitle(meal)}</Text>
                      <Text style={styles.helperText}>{names || 'Not logged yet'}</Text>
                    </View>
                    {(summary?.byMeal?.[meal]?.items || []).length === 0 ? (
                      <Pressable
                        style={styles.miniAddMealButton}
                        onPress={() => {
                          setEntryMealType(meal);
                          setEntryDate(summaryDate);
                          setWebTab('meals');
                          openAddMealModal(meal);
                        }}
                      >
                        <Text style={styles.miniAddMealText}>+ Add Meal</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.webMealKcal}>{mealCal} kcal</Text>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={[styles.card, styles.webCol]}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <Button title="Log Meal" onPress={() => setWebTab('meals')} style={styles.quickActionButton} textStyle={styles.quickActionText} />
              <Button
                title="Scan Food"
                variant="secondary"
                onPress={() => {}}
                style={styles.quickActionButton}
                textStyle={styles.quickActionText}
              />
              <Button
                title="Search Foods"
                variant="secondary"
                onPress={() => setWebTab('meals')}
                style={styles.quickActionButton}
                textStyle={styles.quickActionText}
              />
              <Button title="Recipes" variant="secondary" onPress={() => {}} style={styles.quickActionButton} textStyle={styles.quickActionText} />
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Water Intake</Text>
                <Text style={styles.webMetric}>6 / 8</Text>
                <Button title="Add Glass" variant="secondary" onPress={() => {}} />
              </View>
            </View>
          </View>
        </>
      );
    }

    if (webTab === 'meals') {
      return (
        <>
          <View style={styles.webHeaderRow}>
            <View>
              <Text style={styles.webTitle}>Meals</Text>
              <Text style={styles.subtitle}>Track your daily nutrition</Text>
            </View>
            <View style={styles.webMealsTopRight}>
              <View style={styles.webSearchWrap}>
                <Input
                  hideLabel
                  value={mealSearch}
                  onChangeText={(text) => {
                    setMealSearch(text);
                    setModalFoodQuery(text);
                    setShowSearchAddModal(true);
                  }}
                  onFocus={() => {
                    setModalFoodQuery(mealSearch);
                    setShowSearchAddModal(true);
                  }}
                  placeholder="Search foods from DB..."
                />
              </View>
              <Button
                title="+ Add Meal"
                onPress={() => {
                  setMealSearch('');
                  setModalFoodQuery('');
                  openAddMealModal();
                }}
                style={styles.webGreenCta}
                textStyle={styles.webGreenCtaText}
              />
            </View>
          </View>
          <View style={styles.webHeaderRow}>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, styles.chipInactive]}>
                <Text style={styles.chipTextInactive}>Today</Text>
              </Pressable>
              <Pressable style={[styles.chip, styles.chipInactive]}>
                <Text style={styles.chipTextInactive}>Filter</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>Total: {totalCalories} kcal / 2000 kcal</Text>
          </View>

          <View style={styles.webGrid2}>
            {filteredMeals.map((meal) => (
              <View key={meal} style={[styles.card, styles.webCol]}>
                <View style={styles.webMealHeader}>
                  <Text style={styles.sectionTitle}>{mealTitle(meal)}</Text>
                  <Text style={styles.webMealKcal}>{summary?.byMeal?.[meal]?.calories || 0} kcal</Text>
                </View>
                {(summary?.byMeal?.[meal]?.items || []).length === 0 ? <Text style={styles.helperText}>No items</Text> : null}
                {(summary?.byMeal?.[meal]?.items || []).map((item) => (
                  <View key={item.entryId} style={styles.webMealEntryRow}>
                    <View>
                      <Text style={styles.listRow}>{item.foodName}</Text>
                      <Text style={styles.helperText}>
                        {item.quantity} {item.unit} • Protein: {item.protein}g
                      </Text>
                    </View>
                    <Text style={styles.webMealKcal}>{item.calories} kcal</Text>
                  </View>
                ))}
                <Pressable
                  style={styles.inlineAddLinkWrap}
                  onPress={() => {
                    setEntryMealType(meal);
                    setEntryDate(summaryDate);
                    openAddMealModal(meal);
                  }}
                >
                  <Text style={styles.inlineAddLink}>+ Add Item</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Modal visible={showSearchAddModal} transparent animationType="fade" onRequestClose={() => setShowSearchAddModal(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.sectionTitle}>Add Meal</Text>
                <Input hideLabel value={modalFoodQuery} onChangeText={setModalFoodQuery} placeholder="Search food from DB..." />
                <View style={styles.modalFoodList}>
                  {modalFoods.length === 0 ? <Text style={styles.helperText}>No food found in DB.</Text> : null}
                  {modalFoods.map((food) => (
                    <Pressable
                      key={food.id}
                      style={[styles.searchDropdownItem, searchSelectedFood?.id === food.id ? styles.foodOptionActive : styles.foodOptionInactive]}
                      onPress={() => setSearchSelectedFood(food)}
                    >
                      <Text style={styles.listRow}>{food.name}</Text>
                      <Text style={styles.helperText}>
                        {food.unit} • {food.calories} cal • {food.protein}g protein
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.helperText}>
                  Selected: {searchSelectedFood ? `${searchSelectedFood.name} (${searchSelectedFood.unit})` : 'None'}
                </Text>
                <Text style={styles.label}>Meal Type</Text>
                <View style={styles.chipRow}>
                  {MEAL_TYPES.map((meal) => (
                    <Pressable
                      key={meal}
                      style={[styles.chip, searchMealType === meal ? styles.chipActive : styles.chipInactive]}
                      onPress={() => setSearchMealType(meal)}
                    >
                      <Text style={searchMealType === meal ? styles.chipTextActive : styles.chipTextInactive}>{mealTitle(meal)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Input label="Quantity" value={searchQuantity} onChangeText={setSearchQuantity} keyboardType="numeric" />
                <View style={styles.modalActions}>
                  <Button title="Cancel" variant="secondary" onPress={() => setShowSearchAddModal(false)} />
                  <Button title="Add to Meal" onPress={handleAddFromSearchModal} disabled={!searchSelectedFood} />
                </View>
              </View>
            </View>
          </Modal>
        </>
      );
    }

    if (webTab === 'stats') {
      return (
        <>
          <View style={styles.webHeaderRow}>
            <View>
              <Text style={styles.webTitle}>Your Stats</Text>
              <Text style={styles.subtitle}>Track your nutrition progress and achievements</Text>
            </View>
            <View style={styles.webHeaderActions}>
              <Button title="Last 7 Days" variant="secondary" onPress={() => {}} />
              <Button title="Export" variant="secondary" onPress={() => {}} />
            </View>
          </View>
          <View style={styles.webStatGrid}>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.helperText}>Avg Daily Calories</Text>
              <Text style={styles.webMetric}>{totalCalories}</Text>
            </View>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.helperText}>Protein Intake</Text>
              <Text style={styles.webMetric}>{totalProtein}g</Text>
            </View>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.helperText}>Meals Logged</Text>
              <Text style={styles.webMetric}>{entries.length}</Text>
            </View>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.helperText}>Streak Days</Text>
              <Text style={styles.webMetric}>{Math.max(1, history.length)}</Text>
            </View>
          </View>
          <View style={styles.webGrid2}>
            <View style={[styles.card, styles.webCol]}>
              <Text style={styles.sectionTitle}>Calorie Trends</Text>
              <View style={styles.chartPlaceholder}>
                <Text style={styles.helperText}>Trend chart area</Text>
              </View>
            </View>
            <View style={[styles.card, styles.webCol]}>
              <Text style={styles.sectionTitle}>Macronutrients</Text>
              <View style={styles.listBlock}>
                <Text style={styles.listRow}>Protein: {totalProtein}g (30%)</Text>
                <Text style={styles.listRow}>Carbs: {Math.round(totalCalories * 0.45 * 0.25)}g (45%)</Text>
                <Text style={styles.listRow}>Fats: {Math.round(totalCalories * 0.25 * 0.111)}g (25%)</Text>
              </View>
            </View>
          </View>
          <View style={styles.webStatGrid}>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.sectionTitle}>Weekly Progress</Text>
            </View>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.sectionTitle}>Nutrient Goals</Text>
            </View>
            <View style={[styles.webStatCard, styles.webStatCol]}>
              <Text style={styles.sectionTitle}>Achievements</Text>
            </View>
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.webHeaderRow}>
          <View>
            <Text style={styles.webTitle}>Profile</Text>
            <Text style={styles.subtitle}>Manage your account and nutrition preferences</Text>
          </View>
          <View style={styles.webHeaderActions}>
            <Button title="Settings" variant="secondary" onPress={() => setShowApiSettings((prev) => !prev)} />
          </View>
        </View>
        <View style={styles.webGrid2}>
          <View style={[styles.card, styles.webCol]}>
            <Text style={styles.sectionTitle}>Profile Card</Text>
            <View style={styles.avatarCircle} />
            <Text style={styles.webMetricSmall}>{currentUser?.username}</Text>
            <Text style={styles.helperText}>{currentUser?.username}@email.com</Text>
            <Button title="Change Photo" onPress={() => {}} />
          </View>
          <View style={[styles.card, styles.webCol]}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <Text style={styles.listRow}>Full Name: {currentUser?.username}</Text>
            <Text style={styles.listRow}>Age: 28 years</Text>
            <Text style={styles.listRow}>Height: 165 cm</Text>
            <Text style={styles.listRow}>Weight: 62 kg</Text>
            <Button title="Edit Information" variant="secondary" onPress={() => {}} />
          </View>
        </View>
        <View style={styles.webGrid2}>
          <View style={[styles.card, styles.webCol]}>
            <Text style={styles.sectionTitle}>Goals</Text>
            <Input label="Daily Calories Target" value={targetCalories} onChangeText={setTargetCalories} keyboardType="numeric" />
            <Input label="Daily Protein Target (g)" value={targetProtein} onChangeText={setTargetProtein} keyboardType="numeric" />
            <Text style={styles.listRow}>Water: 2.5L</Text>
            <Button
              title="Save Targets"
              variant="secondary"
              onPress={async () => {
                await saveTargets();
              }}
            />
          </View>
          <View style={[styles.card, styles.webCol]}>
            <Text style={styles.sectionTitle}>Dietary Preferences</Text>
            <Text style={styles.listRow}>Vegetarian</Text>
            <Text style={styles.listRow}>Gluten-Free</Text>
            <Text style={styles.listRow}>Low Carb</Text>
            <Button title="Add Preference" variant="secondary" onPress={() => {}} />
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <Text style={styles.listRow}>Notifications</Text>
          <Text style={styles.listRow}>Privacy and Security</Text>
          <Text style={styles.listRow}>Subscription</Text>
          <Text style={styles.listRow}>Help and Support</Text>
          <Text style={styles.listRow}>Logout</Text>
          <View style={styles.listBlock}>
            <Button title="Refresh History" variant="secondary" onPress={handleRefreshHistory} />
            {history.length === 0 ? <Text style={styles.helperText}>No history yet.</Text> : null}
            {history.map((day) => (
              <Text key={day.date} style={styles.helperText}>
                {day.date}: {day.totals.calories} cal, {day.totals.protein} g
              </Text>
            ))}
          </View>
        </View>
      </>
    );
  }

  if (loadingSession) {
    return (
      <SafeAreaView style={styles.rootCenter}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#0f6d56" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isWeb ? styles.containerWeb : null,
          currentUser && !isAdmin && isWeb ? styles.containerWithBottomNav : null
        ]}
      >
        {!(isWeb && currentUser && !isAdmin) ? (
          <View style={styles.header}>
            <Text style={styles.title}>Calories & Protein Tracker</Text>
            <Text style={styles.subtitle}>Single codebase for Web + Mobile</Text>
          </View>
        ) : null}

        {!currentUser ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Login</Text>
            <Text style={styles.helperText}>Demo: admin/admin123 or user/user123</Text>
            <Input label="Username" value={loginUsername} onChangeText={setLoginUsername} autoCapitalize="none" autoCorrect={false} />
            <Input label="Password" value={loginPassword} onChangeText={setLoginPassword} secureTextEntry />
            <Button title="Login" onPress={handleLogin} />
            <Button
              title={showApiSettings ? 'Hide API Settings' : 'Show API Settings'}
              variant="secondary"
              onPress={() => setShowApiSettings((prev) => !prev)}
            />
            {showApiSettings ? (
              <>
                <Input label="API Base URL" value={apiDraft} onChangeText={setApiDraft} autoCapitalize="none" autoCorrect={false} />
                <Button title="Save API URL" variant="secondary" onPress={() => persistApiBase(apiDraft.trim())} />
                <Text style={styles.helperText}>Web: http://localhost:3000 | Android emulator: http://10.0.2.2:3000</Text>
              </>
            ) : null}
            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
          </View>
        ) : !(isWeb && !isAdmin) ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Account</Text>
            <Text style={styles.successText}>{authStatus}</Text>
            <View style={styles.rowButtons}>
              <Button title="Logout" variant="secondary" onPress={handleLogout} />
            </View>
          </View>
        ) : null}

        {currentUser && isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Admin Panel</Text>
            <View style={styles.chipRow}>
              {[
                { key: 'foods', label: 'Food Items' },
                { key: 'entries', label: 'Meal Entries' }
              ].map((item) => {
                const active = adminView === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    onPress={() => setAdminView(item.key as 'foods' | 'entries')}
                  >
                    <Text style={active ? styles.chipTextActive : styles.chipTextInactive}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {currentUser && isAdmin && adminView === 'foods' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Food Items</Text>
              {isAdmin ? (
                <>
                  <Input label="Item Name" value={foodName} onChangeText={setFoodName} />
                  <Input label="Unit" value={foodUnit} onChangeText={setFoodUnit} />
                  <Input label="Calories per Unit" value={foodCalories} onChangeText={setFoodCalories} keyboardType="numeric" />
                  <Input label="Protein(g) per Unit" value={foodProtein} onChangeText={setFoodProtein} keyboardType="numeric" />
                  <Button title="Add Food Item" onPress={handleAddFood} />
                  {foodStatus ? <Text style={styles.helperText}>{foodStatus}</Text> : null}
                </>
              ) : (
                <Text style={styles.helperText}>Food items are maintained by admin.</Text>
              )}

              <View style={styles.listBlock}>
                {foods.length === 0 ? <Text style={styles.helperText}>No food items available.</Text> : null}
                {foods.map((food) => (
                  <View key={food.id} style={styles.mealBlock}>
                    <Text style={styles.listRow}>
                      ID {food.id}: {food.name} ({food.unit}) | {food.calories} cal | {food.protein} g
                    </Text>
                    {isAdmin ? (
                      editingFoodId === food.id ? (
                        <>
                          <Input label="Edit Name" value={editFoodName} onChangeText={setEditFoodName} />
                          <Input label="Edit Unit" value={editFoodUnit} onChangeText={setEditFoodUnit} />
                          <Input label="Edit Calories" value={editFoodCalories} onChangeText={setEditFoodCalories} keyboardType="numeric" />
                          <Input label="Edit Protein" value={editFoodProtein} onChangeText={setEditFoodProtein} keyboardType="numeric" />
                          <View style={styles.rowButtons}>
                            <Button title="Save Food" onPress={saveFoodEdit} />
                            <Button title="Cancel" variant="secondary" onPress={cancelFoodEdit} />
                          </View>
                        </>
                      ) : (
                        <View style={styles.rowButtons}>
                          <Button title="Edit Food" variant="secondary" onPress={() => startFoodEdit(food)} />
                          <Button title="Delete Food" variant="secondary" onPress={() => deleteFood(food.id)} />
                        </View>
                      )
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {currentUser && isAdmin && adminView === 'entries' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Manage Meal Entries ({summaryDate})</Text>
              <Input label="Date (YYYY-MM-DD)" value={summaryDate} onChangeText={setSummaryDate} />
              <Button title="Refresh Entries" variant="secondary" onPress={handleRefreshSummary} />
              {entries.length === 0 ? <Text style={styles.helperText}>No entries for selected date.</Text> : null}
              {entries.map((entry) => (
                <View key={entry.id} style={styles.mealBlock}>
                  <Text style={styles.listRow}>
                    #{entry.id} | {entry.mealType} | {entry.foodName} | qty {entry.quantity}
                    {isAdmin ? ` | user ${entry.userId}` : ''}
                  </Text>
                  {editingEntryId === entry.id ? (
                    <>
                      <Input label="Edit Date" value={editDate} onChangeText={setEditDate} />
                      <Input label="Edit Meal Type" value={editMealType} onChangeText={setEditMealType} />
                      <Input label="Edit Food ID" value={editFoodId} onChangeText={setEditFoodId} keyboardType="numeric" />
                      <Input label="Edit Quantity" value={editQuantity} onChangeText={setEditQuantity} keyboardType="numeric" />
                      <View style={styles.rowButtons}>
                        <Button title="Save" onPress={saveEdit} />
                        <Button title="Cancel" variant="secondary" onPress={cancelEdit} />
                      </View>
                    </>
                  ) : (
                    <View style={styles.rowButtons}>
                      <Button title="Edit" variant="secondary" onPress={() => startEdit(entry)} />
                      <Button title="Delete" variant="secondary" onPress={() => deleteEntry(entry.id)} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {currentUser && !isAdmin ? (isWeb ? renderWebUserView() : null) : null}
      </ScrollView>
      {currentUser && !isAdmin && isWeb ? (
        <View style={styles.webBottomNav}>
          {[
            { key: 'home', label: 'Home' },
            { key: 'meals', label: 'Meals' },
            { key: 'stats', label: 'Stats' },
            { key: 'profile', label: 'Profile' }
          ].map((item) => (
            <Pressable
              key={item.key}
              style={[styles.webNavItem, webTab === item.key ? styles.webNavItemActive : styles.webNavItemInactive]}
              onPress={() => setWebTab(item.key as 'home' | 'meals' | 'stats' | 'profile')}
            >
              <Text style={webTab === item.key ? styles.webNavTextActive : styles.webNavTextInactive}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f7f5'
  },
  rootCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f7f5'
  },
  container: {
    padding: 16,
    gap: 12
  },
  containerWeb: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingBottom: 24
  },
  containerWithBottomNav: {
    paddingBottom: 100
  },
  header: {
    backgroundColor: '#0f6d56',
    borderRadius: 12,
    padding: 16
  },
  title: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 24
  },
  subtitle: {
    color: '#d9f0e8',
    marginTop: 6
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe4e1',
    gap: 8
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#132a26'
  },
  inputGroup: {
    gap: 5
  },
  label: {
    fontSize: 13,
    color: '#38504b'
  },
  input: {
    borderWidth: 1,
    borderColor: '#cad9d5',
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 46,
    paddingVertical: 10,
    color: '#132a26',
    backgroundColor: '#f9fcfb'
  },
  button: {
    borderRadius: 8,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPrimary: {
    backgroundColor: '#0f6d56'
  },
  buttonSecondary: {
    backgroundColor: '#e6f4ef',
    borderWidth: 1,
    borderColor: '#bad5cc'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    fontWeight: '700'
  },
  buttonTextPrimary: {
    color: '#ffffff'
  },
  buttonTextSecondary: {
    color: '#17453a'
  },
  helperText: {
    color: '#56736b',
    fontSize: 12
  },
  errorText: {
    color: '#b42318',
    fontWeight: '600'
  },
  successText: {
    color: '#145d47',
    fontWeight: '600'
  },
  listBlock: {
    marginTop: 6,
    gap: 6
  },
  listRow: {
    color: '#1d3732'
  },
  mealBlock: {
    borderWidth: 1,
    borderColor: '#d7e6e1',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    gap: 6
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch'
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1
  },
  chipActive: {
    backgroundColor: '#0f6d56',
    borderColor: '#0f6d56'
  },
  chipInactive: {
    backgroundColor: '#f1f7f4',
    borderColor: '#bad5cc'
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  chipTextInactive: {
    color: '#17453a',
    fontWeight: '600'
  },
  foodOption: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8
  },
  foodOptionActive: {
    borderColor: '#0f6d56',
    backgroundColor: '#e6f4ef'
  },
  foodOptionInactive: {
    borderColor: '#d7e6e1',
    backgroundColor: '#ffffff'
  },
  webHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  webHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 320
  },
  webMealsTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 520
  },
  webSearchWrap: {
    flex: 1,
    position: 'relative',
    zIndex: 30
  },
  searchDropdown: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7e6e1',
    borderRadius: 12,
    padding: 8,
    maxHeight: 260
  },
  searchDropdownItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6ece9',
    backgroundColor: '#f8fbfa',
    padding: 10,
    marginBottom: 8
  },
  webGreenCta: {
    backgroundColor: '#14b85c',
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center'
  },
  webGreenCtaText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  webHeaderRowOverlay: {
    zIndex: 20
  },
  webTitle: {
    color: '#0f1720',
    fontWeight: '800',
    fontSize: 44
  },
  webGrid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  webStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8
  },
  webCol: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 360
  },
  webStatCol: {
    flexGrow: 1,
    flexBasis: 220
  },
  webStatCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe4e1',
    backgroundColor: '#f8fbfa',
    padding: 14
  },
  webMetric: {
    color: '#0f1720',
    fontWeight: '800',
    fontSize: 44
  },
  webMetricSmall: {
    color: '#0f1720',
    fontWeight: '800',
    fontSize: 38
  },
  webTopActions: {
    flexDirection: 'row',
    gap: 10
  },
  webMealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  webMealItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e1e9e6',
    backgroundColor: '#f8fbfa',
    padding: 10,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  webMealKcal: {
    color: '#1a362f',
    fontWeight: '700'
  },
  webMealEntryRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e1e9e6',
    backgroundColor: '#f4f6f5',
    padding: 10,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  inlineAddLinkWrap: {
    marginTop: 12,
    alignItems: 'center'
  },
  inlineAddLink: {
    color: '#18b55b',
    fontWeight: '700',
    fontSize: 18
  },
  miniAddMealButton: {
    borderWidth: 1,
    borderColor: '#d7e6e1',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center'
  },
  miniAddMealText: {
    color: '#17453a',
    fontWeight: '700',
    fontSize: 15
  },
  quickActionButton: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6
  },
  quickActionText: {
    textAlign: 'center'
  },
  chartPlaceholder: {
    marginTop: 12,
    minHeight: 260,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe7e4',
    backgroundColor: '#f8fbfa',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#ececec',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8
  },
  webBottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#d7e6e1',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 10
  },
  webNavItem: {
    minWidth: 120,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10
  },
  webNavItemActive: {
    backgroundColor: '#e6f4ef'
  },
  webNavItemInactive: {
    backgroundColor: '#ffffff'
  },
  webNavTextActive: {
    color: '#0f6d56',
    fontWeight: '700'
  },
  webNavTextInactive: {
    color: '#5f726b',
    fontWeight: '600'
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50
  },
  modalCard: {
    width: '92%',
    maxWidth: 520,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7e6e1',
    padding: 18,
    gap: 10
  },
  modalFoodList: {
    maxHeight: 220
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end'
  }
});
