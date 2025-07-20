/* eslint-disable @typescript-eslint/naming-convention */
import { WebdavApi } from './webdav-api';
import { WebdavPrivateCfg } from './webdav.model';
import { WebDavHttpAdapter } from './webdav-http-adapter';
import { WebdavXmlParser } from './webdav-xml-parser';
import { HttpNotOkAPIError } from '../../../errors/errors';

describe('WebdavApi', () => {
  let api: WebdavApi;
  let mockGetCfg: jasmine.Spy;
  let mockHttpAdapter: jasmine.SpyObj<WebDavHttpAdapter>;
  let mockXmlParser: jasmine.SpyObj<WebdavXmlParser>;
  const mockCfg: WebdavPrivateCfg = {
    baseUrl: 'http://example.com/webdav',
    userName: 'testuser',
    password: 'testpass',
    syncFolderPath: '/sync',
    encryptKey: '',
  };

  beforeEach(() => {
    mockGetCfg = jasmine
      .createSpy('getCfgOrError')
      .and.returnValue(Promise.resolve(mockCfg));
    api = new WebdavApi(mockGetCfg);

    // Access private properties for mocking
    mockHttpAdapter = jasmine.createSpyObj('WebDavHttpAdapter', ['request']);
    mockXmlParser = jasmine.createSpyObj('WebdavXmlParser', [
      'parseMultiplePropsFromXml',
      'validateResponseContent',
    ]);
    (api as any).httpAdapter = mockHttpAdapter;
    (api as any).xmlParser = mockXmlParser;
  });

  describe('getFileMeta', () => {
    it('should get file metadata successfully using PROPFIND', async () => {
      const mockResponse = {
        status: 207,
        headers: {},
        data: '<?xml version="1.0"?><multistatus/>',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      const mockFileMeta = {
        filename: 'test.txt',
        basename: 'test.txt',
        lastmod: 'Wed, 15 Jan 2025 10:00:00 GMT',
        size: 1234,
        type: 'file',
        etag: 'abc123',
        data: {},
      };
      mockXmlParser.parseMultiplePropsFromXml.and.returnValue([mockFileMeta]);

      const result = await api.getFileMeta('/test.txt', null);

      expect(mockHttpAdapter.request).toHaveBeenCalledWith({
        url: 'http://example.com/webdav/test.txt',
        method: 'PROPFIND',
        body: WebdavXmlParser.PROPFIND_XML,
        headers: jasmine.objectContaining({
          'Content-Type': 'application/xml; charset=utf-8',
          Depth: '0',
        }),
      });

      expect(mockXmlParser.parseMultiplePropsFromXml).toHaveBeenCalledWith(
        '<?xml version="1.0"?><multistatus/>',
        '/test.txt',
      );

      expect(result).toEqual(mockFileMeta);
    });

    it('should throw RemoteFileNotFoundAPIError when PROPFIND returns non-207 status', async () => {
      const mockResponse = {
        status: 404,
        headers: {},
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      await expectAsync(api.getFileMeta('/test.txt', null)).toBeRejectedWith(
        jasmine.objectContaining({
          name: ' RemoteFileNotFoundAPIError',
        }),
      );
    });

    it('should throw RemoteFileNotFoundAPIError when no files parsed from response', async () => {
      const mockResponse = {
        status: 207,
        headers: {},
        data: '<?xml version="1.0"?><multistatus/>',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));
      mockXmlParser.parseMultiplePropsFromXml.and.returnValue([]);

      await expectAsync(api.getFileMeta('/test.txt', null)).toBeRejectedWith(
        jasmine.objectContaining({
          name: ' RemoteFileNotFoundAPIError',
        }),
      );
    });

    it('should handle paths with special characters', async () => {
      const mockResponse = {
        status: 207,
        headers: {},
        data: '<?xml version="1.0"?><multistatus/>',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));
      mockXmlParser.parseMultiplePropsFromXml.and.returnValue([
        {
          filename: 'file with spaces.txt',
          basename: 'file with spaces.txt',
          lastmod: 'Wed, 15 Jan 2025 10:00:00 GMT',
          size: 100,
          type: 'file',
          etag: 'def456',
          data: {},
        },
      ]);

      await api.getFileMeta('/folder/file with spaces.txt', null);

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          url: 'http://example.com/webdav/folder/file with spaces.txt',
        }),
      );
    });
  });

  describe('download', () => {
    it('should download file successfully', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          etag: '"abc123"',
          'last-modified': 'Wed, 15 Jan 2025 10:00:00 GMT',
        },
        data: 'file content',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));
      mockXmlParser.validateResponseContent.and.stub();

      const result = await api.download({
        path: '/test.txt',
      });

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          url: 'http://example.com/webdav/test.txt',
          method: 'GET',
        }),
      );

      expect(mockXmlParser.validateResponseContent).toHaveBeenCalledWith(
        'file content',
        '/test.txt',
        'download',
        'file content',
      );

      expect(result).toEqual({
        rev: 'abc123',
        dataStr: 'file content',
        lastModified: 'Wed, 15 Jan 2025 10:00:00 GMT',
      });
    });

    it('should clean etag values', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          etag: '"abc123"',
        },
        data: 'content',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));
      mockXmlParser.validateResponseContent.and.stub();

      // Override _cleanRev for testing
      spyOn<any>(api, '_cleanRev').and.returnValue('cleanedAbc123');

      const result = await api.download({
        path: '/test.txt',
      });

      expect(result.rev).toBe('cleanedAbc123');
    });

    it('should use last-modified as rev when no etag', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          'last-modified': 'Wed, 15 Jan 2025 10:00:00 GMT',
        },
        data: 'content',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));
      mockXmlParser.validateResponseContent.and.stub();

      const result = await api.download({
        path: '/test.txt',
      });

      expect(result.rev).toBe('Wed, 15 Jan 2025 10:00:00 GMT');
    });

    // Test removed: If-None-Match header functionality has been removed
    // Test removed: If-Modified-Since header functionality has been removed
    // Test removed: If-Modified-Since header functionality has been removed
    // Test removed: 304 Not Modified handling has been removed
    // Test removed: 304 Not Modified handling has been removed
    // Test removed: localRev parameter has been removed from download method
    // Test removed: localRev parameter has been removed from download method
  });

  describe('upload', () => {
    it('should upload file successfully', async () => {
      const mockResponse = {
        status: 201,
        headers: {
          etag: '"newrev123"',
          'last-modified': 'Wed, 15 Jan 2025 11:00:00 GMT',
        },
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      const result = await api.upload({
        path: '/test.txt',
        data: 'new content',
        expectedRev: null,
      });

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          url: 'http://example.com/webdav/test.txt',
          method: 'PUT',
          body: 'new content',
          headers: jasmine.objectContaining({
            'Content-Type': 'application/octet-stream',
          }),
        }),
      );

      expect(result).toEqual({
        rev: 'newrev123',
        lastModified: 'Wed, 15 Jan 2025 11:00:00 GMT',
      });
    });

    it('should handle conditional upload with etag', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          etag: '"newrev123"',
        },
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      await api.upload({
        path: '/test.txt',
        data: 'new content',
        expectedRev: 'oldrev123',
      });

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          headers: jasmine.objectContaining({
            'If-Match': 'oldrev123',
          }),
        }),
      );
    });

    it('should handle conditional upload with timestamp', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          etag: '"newrev123"',
        },
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      const timestamp = '1642248000000'; // Unix timestamp

      await api.upload({
        path: '/test.txt',
        data: 'new content',
        expectedRev: timestamp,
      });

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          headers: jasmine.objectContaining({
            'If-Unmodified-Since': jasmine.any(String),
          }),
        }),
      );
    });

    it('should handle 412 Precondition Failed', async () => {
      const errorResponse = new Response(null, { status: 412 });
      const error = new HttpNotOkAPIError(errorResponse);
      mockHttpAdapter.request.and.returnValue(Promise.reject(error));

      await expectAsync(
        api.upload({
          path: '/test.txt',
          data: 'new content',
          expectedRev: 'oldrev',
        }),
      ).toBeRejectedWith(
        jasmine.objectContaining({
          name: 'RemoteFileChangedUnexpectedly',
        }),
      );
    });

    it('should handle 409 Conflict by creating parent directory', async () => {
      const errorResponse = new Response(null, { status: 409 });
      const error = new HttpNotOkAPIError(errorResponse);

      // First call fails with 409
      // Second call to create directory succeeds
      // Third call to upload succeeds
      const mockResponses = [
        Promise.reject(error),
        Promise.resolve({ status: 201, headers: {}, data: '' }),
        Promise.resolve({
          status: 201,
          headers: { etag: '"newrev123"' },
          data: '',
        }),
      ];
      let callCount = 0;
      mockHttpAdapter.request.and.callFake(() => mockResponses[callCount++]);

      const result = await api.upload({
        path: '/folder/test.txt',
        data: 'new content',
        expectedRev: null,
      });

      expect(mockHttpAdapter.request).toHaveBeenCalledTimes(3);
      // Check MKCOL call
      expect(mockHttpAdapter.request.calls.argsFor(1)[0]).toEqual(
        jasmine.objectContaining({
          url: 'http://example.com/webdav/folder',
          method: 'MKCOL',
        }),
      );
      expect(result.rev).toBe('newrev123');
    });

    it('should fetch metadata when no rev in response headers', async () => {
      const mockUploadResponse = {
        status: 201,
        headers: {}, // No etag or last-modified
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockUploadResponse));

      // Mock getFileMeta to be called after upload
      spyOn(api, 'getFileMeta').and.returnValue(
        Promise.resolve({
          filename: 'test.txt',
          basename: 'test.txt',
          lastmod: 'Wed, 15 Jan 2025 12:00:00 GMT',
          size: 100,
          type: 'file',
          etag: 'fetched123',
          data: {},
        }),
      );

      const result = await api.upload({
        path: '/test.txt',
        data: 'new content',
        expectedRev: null,
      });

      expect(api.getFileMeta).toHaveBeenCalledWith('/test.txt', null, true);
      expect(result).toEqual({
        rev: 'fetched123',
        lastModified: 'Wed, 15 Jan 2025 12:00:00 GMT',
      });
    });
  });

  describe('remove', () => {
    it('should remove file successfully', async () => {
      const mockResponse = {
        status: 204,
        headers: {},
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      await api.remove('/test.txt');

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          url: 'http://example.com/webdav/test.txt',
          method: 'DELETE',
        }),
      );
    });

    it('should handle conditional delete with etag', async () => {
      const mockResponse = {
        status: 204,
        headers: {},
        data: '',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));

      await api.remove('/test.txt', 'abc123');

      expect(mockHttpAdapter.request).toHaveBeenCalledWith(
        jasmine.objectContaining({
          url: 'http://example.com/webdav/test.txt',
          method: 'DELETE',
          headers: jasmine.objectContaining({
            'If-Match': 'abc123',
          }),
        }),
      );
    });
  });

  describe('_cleanRev', () => {
    it('should clean revision strings', () => {
      expect((api as any)._cleanRev('"abc123"')).toBe('abc123');
      expect((api as any)._cleanRev('abc/123')).toBe('abc123');
      expect((api as any)._cleanRev('"abc/123"')).toBe('abc123');
      expect((api as any)._cleanRev('&quot;abc123&quot;')).toBe('abc123');
      expect((api as any)._cleanRev('')).toBe('');
    });
  });

  describe('_isLikelyTimestamp', () => {
    it('should identify valid timestamps', () => {
      expect((api as any)._isLikelyTimestamp('1642248000')).toBe(true); // 10 digits
      expect((api as any)._isLikelyTimestamp('1642248000000')).toBe(true); // 13 digits
      expect((api as any)._isLikelyTimestamp('abc123')).toBe(false);
      expect((api as any)._isLikelyTimestamp('123')).toBe(false); // too short
    });
  });

  describe('_isLikelyDateString', () => {
    it('should identify date strings', () => {
      expect((api as any)._isLikelyDateString('Wed, 15 Jan 2025 10:00:00 GMT')).toBe(
        true,
      );
      expect((api as any)._isLikelyDateString('2025-01-15')).toBe(true);
      expect((api as any)._isLikelyDateString('2025-01-15T10:00:00Z')).toBe(true);
      expect((api as any)._isLikelyDateString('abc123')).toBe(false);
    });
  });

  describe('_buildFullPath', () => {
    it('should build correct full paths', () => {
      expect((api as any)._buildFullPath('http://example.com/', '/file.txt')).toBe(
        'http://example.com/file.txt',
      );
      expect((api as any)._buildFullPath('http://example.com', 'file.txt')).toBe(
        'http://example.com/file.txt',
      );
      expect((api as any)._buildFullPath('http://example.com/', 'file.txt')).toBe(
        'http://example.com/file.txt',
      );
    });
  });

  describe('error handling', () => {
    it('should call getCfgOrError for each operation', async () => {
      const mockResponse = {
        status: 207,
        headers: {},
        data: '<?xml version="1.0"?><multistatus/>',
      };
      mockHttpAdapter.request.and.returnValue(Promise.resolve(mockResponse));
      mockXmlParser.parseMultiplePropsFromXml.and.returnValue([
        {
          filename: 'test.txt',
          basename: 'test.txt',
          lastmod: '',
          size: 0,
          type: 'file',
          etag: 'abc',
          data: {},
        },
      ]);

      await api.getFileMeta('/test.txt', null);

      expect(mockGetCfg).toHaveBeenCalled();
    });

    it('should propagate errors from getCfgOrError', async () => {
      const error = new Error('Config error');
      mockGetCfg.and.returnValue(Promise.reject(error));

      await expectAsync(api.getFileMeta('/test.txt', null)).toBeRejectedWith(error);
    });
  });
});
