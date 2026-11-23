import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  root: '.',
  publicDir: 'assets',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      input: {
        main: 'src/main.ts'
      },
      output: {
        manualChunks: {
          'core': [
            'src/core/MathUtils.ts',
            'src/core/EventBus.ts',
            'src/core/Component.ts',
            'src/core/Entity.ts',
            'src/core/System.ts',
            'src/core/Config.ts',
            'src/core/Engine.ts'
          ],
          'combat': [
            'src/combat/DamageCalculator.ts',
            'src/combat/HitStop.ts',
            'src/combat/PoiseSystem.ts',
            'src/combat/Weapon.ts',
            'src/combat/WeaponSystem.ts',
            'src/combat/CombatController.ts'
          ],
          'movement': [
            'src/movement/LocomotionStateMachine.ts'
          ],
          'skills': [
            'src/skills/SkillSystem.ts'
          ],
          'creatures': [
            'src/creatures/CreatureAI.ts',
            'src/creatures/ChimeraSystem.ts'
          ],
          'building': [
            'src/building/BuildingSystem.ts'
          ],
          'pooling': [
            'src/pooling/ObjectPool.ts'
          ]
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['@webgpu/types']
  },
  define: {
    'import.meta.env.GAME_VERSION': JSON.stringify(process.env.npm_package_version)
  }
});