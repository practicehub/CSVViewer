import { SmartDatabaseSelector } from './db-manager';

async function migrateDatabase() {
  let dbManager: any = null;
  
  try {
    console.log('🔄 开始数据库迁移...');
    
    // 创建数据库连接
    dbManager = await SmartDatabaseSelector.createOptimizedDatabase(0);
    
    // 检查is_admin列是否存在
    const tableInfo = dbManager.all("PRAGMA table_info(users)");
    const hasAdminColumn = tableInfo.some((column: any) => column.name === 'is_admin');
    
    if (!hasAdminColumn) {
      console.log('📝 添加is_admin列到users表...');
      dbManager.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
      console.log('✅ 成功添加is_admin列');
    } else {
      console.log('✅ is_admin列已存在');
    }
    
    // 检查是否有管理员用户
    const existingAdmin = dbManager.get('SELECT * FROM users WHERE is_admin = 1');
    
    if (!existingAdmin) {
      // 获取第一个用户并将其设为管理员
      const firstUser = dbManager.get('SELECT * FROM users ORDER BY id ASC LIMIT 1');
      
      if (firstUser) {
        dbManager.run('UPDATE users SET is_admin = 1 WHERE id = ?', [firstUser.id]);
        console.log(`✅ 已将用户 "${firstUser.username}" 设置为管理员`);
      } else {
        console.log('⚠️  没有找到任何用户，请先注册一个用户');
      }
    } else {
      console.log(`✅ 管理员已存在: ${existingAdmin.username}`);
    }
    
    console.log('🎉 数据库迁移完成！');
    
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
  } finally {
    if (dbManager) {
      dbManager.close();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateDatabase();
}

export default migrateDatabase;
