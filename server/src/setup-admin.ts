import { SmartDatabaseSelector } from './db-manager';
import bcrypt from 'bcrypt';

async function setupAdmin() {
  let dbManager: any = null;
  
  try {
    console.log('🔧 设置管理员账户...');
    
    // 创建数据库连接
    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);
    
    // 检查是否已有管理员
    const existingAdmin = dbManager.get('SELECT * FROM users WHERE is_admin = 1');
    
    if (existingAdmin) {
      console.log(`✅ 管理员已存在: ${existingAdmin.username}`);
      return;
    }
    
    // 获取第一个用户并将其设为管理员
    const firstUser = dbManager.get('SELECT * FROM users ORDER BY id ASC LIMIT 1');
    
    if (!firstUser) {
      console.log('❌ 没有找到任何用户，请先注册一个用户');
      return;
    }
    
    // 将第一个用户设为管理员
    dbManager.run('UPDATE users SET is_admin = 1 WHERE id = ?', [firstUser.id]);
    
    console.log(`✅ 已将用户 "${firstUser.username}" 设置为管理员`);
    
  } catch (error) {
    console.error('❌ 设置管理员失败:', error);
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupAdmin();
}

export default setupAdmin;
