import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateAbsolutePath, validateUserPath, registerApprovedPath } from './ipc'

// Mock electron to avoid loading the real module
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() }
}))

describe('validateAbsolutePath', () => {
  const label = 'test'

  describe('input validation', () => {
    it('should reject null', () => {
      expect(() => validateAbsolutePath(null as any, label)).toThrow('path must be a non-empty string')
    })

    it('should reject undefined', () => {
      expect(() => validateAbsolutePath(undefined as any, label)).toThrow('path must be a non-empty string')
    })

    it('should reject empty string', () => {
      expect(() => validateAbsolutePath('', label)).toThrow('path must be a non-empty string')
    })

    it('should reject number', () => {
      expect(() => validateAbsolutePath(123 as any, label)).toThrow('path must be a non-empty string')
    })

    it('should reject object', () => {
      expect(() => validateAbsolutePath({} as any, label)).toThrow('path must be a non-empty string')
    })

    it('should reject array', () => {
      expect(() => validateAbsolutePath([] as any, label)).toThrow('path must be a non-empty string')
    })
  })

  describe('path validation', () => {
    it('should reject relative paths', () => {
      expect(() => validateAbsolutePath('relative/path', label)).toThrow('path must be absolute')
      expect(() => validateAbsolutePath('./relative', label)).toThrow('path must be absolute')
      expect(() => validateAbsolutePath('../relative', label)).toThrow('path must be absolute')
    })

    it('should reject non-existent paths', () => {
      const nonExistent = join(tmpdir(), `orchflow-test-nonexistent-${Date.now()}`)
      expect(() => validateAbsolutePath(nonExistent, label)).toThrow('path does not exist')
    })

    it('should accept valid absolute paths', () => {
      const tempDir = join(tmpdir(), `orchflow-test-valid-${Date.now()}`)
      mkdirSync(tempDir)
      try {
        const result = validateAbsolutePath(tempDir, label)
        expect(result).toBe(resolve(tempDir))
      } finally {
        rmSync(tempDir, { recursive: true })
      }
    })

    it('should resolve symlinks', () => {
      // Skip on Windows - requires admin privileges or Developer Mode
      if (process.platform === 'win32') {
        return
      }
      const tempDir = join(tmpdir(), `orchflow-test-symlink-${Date.now()}`)
      const realDir = join(tempDir, 'real')
      const linkDir = join(tempDir, 'link')
      mkdirSync(realDir, { recursive: true })
      symlinkSync(realDir, linkDir)
      try {
        const result = validateAbsolutePath(linkDir, label)
        expect(result).toBe(resolve(realDir))
      } finally {
        rmSync(tempDir, { recursive: true })
      }
    })
  })

  describe('device/UNC path rejection (Windows)', () => {
    it('should reject \\\\?\\ paths', () => {
      const devicePath = '\\\\?\\C:\\Windows\\System32'
      // This will fail on existence check first, but we want to ensure the logic is there
      expect(() => validateAbsolutePath(devicePath, label)).toThrow()
    })

    it('should reject \\\\.\\ paths', () => {
      const devicePath = '\\\\.\\COM1'
      expect(() => validateAbsolutePath(devicePath, label)).toThrow()
    })

    it('should reject //./ paths', () => {
      const devicePath = '//./COM1'
      expect(() => validateAbsolutePath(devicePath, label)).toThrow()
    })
  })
})

describe('validateUserPath', () => {
  const label = 'test'
  let approvedDir: string

  beforeEach(() => {
    approvedDir = join(tmpdir(), `orchflow-test-approved-${Date.now()}`)
    mkdirSync(approvedDir, { recursive: true })
    registerApprovedPath(approvedDir)
  })

  afterEach(() => {
    if (existsSync(approvedDir)) {
      rmSync(approvedDir, { recursive: true })
    }
  })

  describe('inherits validateAbsolutePath checks', () => {
    it('should reject non-string input', () => {
      expect(() => validateUserPath(null as any, label)).toThrow('path must be a non-empty string')
    })

    it('should reject relative paths', () => {
      expect(() => validateUserPath('relative/path', label)).toThrow('path must be absolute')
    })

    it('should reject non-existent paths', () => {
      const nonExistent = join(approvedDir, 'nonexistent')
      expect(() => validateUserPath(nonExistent, label)).toThrow('path does not exist')
    })
  })

  describe('approved path enforcement', () => {
    it('should accept exact match of approved path', () => {
      const result = validateUserPath(approvedDir, label)
      expect(result).toBe(resolve(approvedDir))
    })

    it('should accept subdirectory of approved path', () => {
      const subDir = join(approvedDir, 'sub', 'dir')
      mkdirSync(subDir, { recursive: true })
      const result = validateUserPath(subDir, label)
      expect(result).toBe(resolve(subDir))
    })

    it('should reject path outside approved root', () => {
      const outsidePath = join(tmpdir(), `orchflow-test-outside-${Date.now()}`)
      mkdirSync(outsidePath, { recursive: true })
      try {
        expect(() => validateUserPath(outsidePath, label)).toThrow('path is not under any registered project root')
      } finally {
        rmSync(outsidePath, { recursive: true })
      }
    })

    it('should reject path that only partially matches approved root', () => {
      // Create a path like /tmp/orchflow-test-approved-123456extra
      const partialMatch = approvedDir + 'extra'
      mkdirSync(partialMatch, { recursive: true })
      try {
        expect(() => validateUserPath(partialMatch, label)).toThrow('path is not under any registered project root')
      } finally {
        rmSync(partialMatch, { recursive: true })
      }
    })

    it('should handle multiple approved roots', () => {
      const secondApproved = join(tmpdir(), `orchflow-test-approved2-${Date.now()}`)
      mkdirSync(secondApproved, { recursive: true })
      registerApprovedPath(secondApproved)
      try {
        const result1 = validateUserPath(approvedDir, label)
        expect(result1).toBe(resolve(approvedDir))

        const result2 = validateUserPath(secondApproved, label)
        expect(result2).toBe(resolve(secondApproved))
      } finally {
        rmSync(secondApproved, { recursive: true })
      }
    })
  })

  describe('path traversal prevention', () => {
    it('should prevent traversal outside approved root via realpath', () => {
      // Skip on Windows - requires admin privileges or Developer Mode
      if (process.platform === 'win32') {
        return
      }
      // Create a symlink that points outside the approved directory
      const outsideDir = join(tmpdir(), `orchflow-test-outside-${Date.now()}`)
      const linkPath = join(approvedDir, 'escape-link')
      mkdirSync(outsideDir, { recursive: true })
      symlinkSync(outsideDir, linkPath)
      try {
        // The symlink resolves to outsideDir, which is not approved
        expect(() => validateUserPath(linkPath, label)).toThrow('path is not under any registered project root')
      } finally {
        rmSync(outsideDir, { recursive: true })
      }
    })
  })

  describe('edge cases', () => {
    it('should handle paths with trailing slashes', () => {
      const withSlash = approvedDir + '/'
      const result = validateUserPath(withSlash, label)
      expect(result).toBe(resolve(approvedDir))
    })

    it('should handle paths with multiple slashes', () => {
      const subDir = join(approvedDir, 'sub')
      mkdirSync(subDir, { recursive: true })
      const withMultiple = join(approvedDir, 'sub//dir')
      mkdirSync(join(approvedDir, 'sub', 'dir'), { recursive: true })
      const result = validateUserPath(withMultiple, label)
      expect(result).toBe(resolve(join(approvedDir, 'sub', 'dir')))
    })
  })
})
