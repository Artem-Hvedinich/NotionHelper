import { NotionDatabaseKey } from '../config/databases';
import { UserModeState } from '../types';

/**
 * Сервис для управления состоянием пользователей.
 * Отвечает за хранение выбранных баз данных и режимов работы.
 */
class UserStateService {
  // Постоянный выбор (запомненная база данных)
  private userDbSelection = new Map<number, NotionDatabaseKey>();
  
  // Временное состояние режима (ожидание ввода)
  private userMode = new Map<number, UserModeState>();
  
  // Хранилище ID сообщений бота для каждого пользователя (для удаления при /start)
  private userBotMessages = new Map<number, number[]>();
  
  // Хранилище для связи коротких ID с pageId (для callback_data)
  private taskIdMap = new Map<string, string>(); // shortId -> pageId
  private taskIdCounter = 0;
  
  // Хранилище для навигации по спискам задач (для кнопки "Назад")
  private userTaskListStatus = new Map<number, string>(); // userId -> status

  // Хранилище для режима редактирования поля (userId -> { shortId, propertyName, propertyType })
  private userEditMode = new Map<number, { shortId: string; propertyName: string; propertyType: string }>();

  // Хранилище ID сообщения с главным меню (чтобы не удалять его при очистке)
  private userMainMenuMessage = new Map<number, number>(); // userId -> messageId

  // Хранилище ID сообщений пользователя для каждого пользователя (для удаления при очистке)
  private userUserMessages = new Map<number, number[]>(); // userId -> messageId[]

  /**
   * Устанавливает выбранную базу данных для пользователя.
   */
  setUserDatabase(userId: number, key: NotionDatabaseKey): void {
    this.userDbSelection.set(userId, key);
  }

  /**
   * Получает выбранную базу данных пользователя.
   */
  getUserDatabase(userId: number): NotionDatabaseKey | null {
    return this.userDbSelection.get(userId) || null;
  }

  /**
   * Устанавливает режим работы пользователя.
   */
  setUserMode(userId: number, mode: 'idle' | 'create', dbKey?: NotionDatabaseKey): void {
    this.userMode.set(userId, { mode, dbKey });
  }

  /**
   * Получает режим работы пользователя.
   */
  getUserMode(userId: number): UserModeState {
    return this.userMode.get(userId) || { mode: 'idle' };
  }

  /**
   * Сохраняет ID сообщения бота для последующего удаления.
   */
  trackBotMessage(userId: number, messageId: number): void {
    const currentMessages = this.userBotMessages.get(userId) || [];
    // Избегаем дубликатов
    if (!currentMessages.includes(messageId)) {
      currentMessages.push(messageId);
      this.userBotMessages.set(userId, currentMessages);
      console.log(`[DEBUG] Tracking message ${messageId} for user ${userId}. Total: ${currentMessages.length}`);
    }
  }

  /**
   * Получает список ID сообщений бота для пользователя.
   */
  getUserBotMessages(userId: number): number[] {
    return this.userBotMessages.get(userId) || [];
  }

  /**
   * Очищает список сообщений бота для пользователя.
   */
  clearUserBotMessages(userId: number): void {
    this.userBotMessages.set(userId, []);
  }

  /**
   * Регистрирует pageId и возвращает короткий идентификатор для использования в callback_data.
   */
  registerTaskId(pageId: string): string {
    const shortId = `t${this.taskIdCounter++}`;
    this.taskIdMap.set(shortId, pageId);
    return shortId;
  }

  /**
   * Получает pageId по короткому идентификатору.
   */
  getTaskPageId(shortId: string): string | null {
    return this.taskIdMap.get(shortId) || null;
  }

  /**
   * Удаляет регистрацию задачи (опционально, для очистки памяти).
   */
  unregisterTaskId(shortId: string): void {
    this.taskIdMap.delete(shortId);
  }

  /**
   * Сохраняет статус для навигации назад к списку задач.
   */
  setUserTaskListStatus(userId: number, status: string): void {
    this.userTaskListStatus.set(userId, status);
  }

  /**
   * Получает сохраненный статус для навигации назад.
   */
  getUserTaskListStatus(userId: number): string | null {
    return this.userTaskListStatus.get(userId) || null;
  }

  /**
   * Устанавливает режим редактирования поля для пользователя.
   */
  setUserEditMode(userId: number, shortId: string, propertyName: string, propertyType: string): void {
    this.userEditMode.set(userId, { shortId, propertyName, propertyType });
  }

  /**
   * Получает режим редактирования поля для пользователя.
   */
  getUserEditMode(userId: number): { shortId: string; propertyName: string; propertyType: string } | null {
    return this.userEditMode.get(userId) || null;
  }

  /**
   * Очищает режим редактирования поля для пользователя.
   */
  clearUserEditMode(userId: number): void {
    this.userEditMode.delete(userId);
  }

  /**
   * Сохраняет ID сообщения с главным меню.
   */
  setMainMenuMessage(userId: number, messageId: number): void {
    this.userMainMenuMessage.set(userId, messageId);
  }

  /**
   * Получает ID сообщения с главным меню.
   */
  getMainMenuMessage(userId: number): number | null {
    return this.userMainMenuMessage.get(userId) || null;
  }

  /**
   * Сохраняет ID сообщения пользователя для последующего удаления.
   */
  trackUserMessage(userId: number, messageId: number): void {
    const currentMessages = this.userUserMessages.get(userId) || [];
    // Избегаем дубликатов
    if (!currentMessages.includes(messageId)) {
      currentMessages.push(messageId);
      this.userUserMessages.set(userId, currentMessages);
    }
  }

  /**
   * Получает список ID сообщений пользователя.
   */
  getUserMessages(userId: number): number[] {
    return this.userUserMessages.get(userId) || [];
  }

  /**
   * Очищает список сообщений пользователя.
   */
  clearUserMessages(userId: number): void {
    this.userUserMessages.set(userId, []);
  }
}

// Экспортируем singleton экземпляр
export const userStateService = new UserStateService();

