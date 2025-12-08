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
}

// Экспортируем singleton экземпляр
export const userStateService = new UserStateService();

