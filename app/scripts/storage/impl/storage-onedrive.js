import { StorageBase } from 'storage/storage-base';
import { OneDriveApps } from 'const/cloud-storage-apps';
import { Features } from 'util/features';

// https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow

class StorageOneDrive extends StorageBase {
    name = 'onedrive';
    enabled = true;
    uipos = 40;
    iconSvg = 'onedrive';

    _baseUrl = 'https://graph.microsoft.com/v1.0/me';

    getPathForName(fileName) {
        return '/drive/root:/' + fileName + '.kdbx';
    }

    load(path, opts, callback) {
        this._oauthAuthorize(err => {
            if (err) {
                return callback && callback(err);
            }
            this.logger.debug('Load', path);
            const ts = this.logger.ts();
            const url = this._baseUrl + path;
            this._xhr({
                url,
                responseType: 'json',
                success: response => {
                    const downloadUrl = response['@microsoft.graph.downloadUrl'];
                    let rev = response.eTag;
                    if (!downloadUrl || !response.eTag) {
                        this.logger.debug(
                            'Load error',
                            path,
                            'no download url',
                            response,
                            this.logger.ts(ts)
                        );
                        return callback && callback('no download url');
                    }
                    this._xhr({
                        url: downloadUrl,
                        responseType: 'arraybuffer',
                        skipAuth: true,
                        success: (response, xhr) => {
                            rev = xhr.getResponseHeader('ETag') || rev;
                            this.logger.debug('Loaded', path, rev, this.logger.ts(ts));
                            return callback && callback(null, response, { rev });
                        },
                        error: err => {
                            this.logger.error('Load error', path, err, this.logger.ts(ts));
                            return callback && callback(err);
                        }
                    });
                },
                error: err => {
                    this.logger.error('Load error', path, err, this.logger.ts(ts));
                    return callback && callback(err);
                }
            });
        });
    }

    stat(path, opts, callback) {
        this._oauthAuthorize(err => {
            if (err) {
                return callback && callback(err);
            }
            this.logger.debug('Stat', path);
            const ts = this.logger.ts();
            const url = this._baseUrl + path;
            this._xhr({
                url,
                responseType: 'json',
                success: response => {
                    const rev = response.eTag;
                    if (!rev) {
                        this.logger.error('Stat error', path, 'no eTag', this.logger.ts(ts));
                        return callback && callback('no eTag');
                    }
                    this.logger.debug('Stated', path, rev, this.logger.ts(ts));
                    return callback && callback(null, { rev });
                },
                error: (err, xhr) => {
                    if (xhr.status === 404) {
                        this.logger.debug('Stated not found', path, this.logger.ts(ts));
                        return callback && callback({ notFound: true });
                    }
                    this.logger.error('Stat error', path, err, this.logger.ts(ts));
                    return callback && callback(err);
                }
            });
        });
    }

    save(path, opts, data, callback, rev) {
        this._oauthAuthorize(err => {
            if (err) {
                return callback && callback(err);
            }
            this.logger.debug('Save', path, rev);
            const ts = this.logger.ts();
            const url = this._baseUrl + path + ':/content';
            this._xhr({
                url,
                method: 'PUT',
                responseType: 'json',
                headers: rev ? { 'If-Match': rev } : null,
                data,
                statuses: [200, 201, 412],
                success: (response, xhr) => {
                    rev = response.eTag;
                    if (!rev) {
                        this.logger.error('Save error', path, 'no eTag', this.logger.ts(ts));
                        return callback && callback('no eTag');
                    }
                    if (xhr.status === 412) {
                        this.logger.debug('Save conflict', path, rev, this.logger.ts(ts));
                        return callback && callback({ revConflict: true }, { rev });
                    }
                    this.logger.debug('Saved', path, rev, this.logger.ts(ts));
                    return callback && callback(null, { rev });
                },
                error: err => {
                    this.logger.error('Save error', path, err, this.logger.ts(ts));
                    return callback && callback(err);
                }
            });
        });
    }

    list(dir, callback) {
        this._oauthAuthorize(err => {
            if (err) {
                return callback && callback(err);
            }
            this.logger.debug('List');
            const ts = this.logger.ts();
            const url = this._baseUrl + (dir ? `${dir}:/children` : '/drive/root/children');
            this._xhr({
                url,
                responseType: 'json',
                success: response => {
                    if (!response || !response.value) {
                        this.logger.error('List error', this.logger.ts(ts), response);
                        return callback && callback('list error');
                    }
                    this.logger.debug('Listed', this.logger.ts(ts));
                    const fileList = response.value
                        .filter(f => f.name)
                        .map(f => ({
                            name: f.name,
                            path: f.parentReference.path + '/' + f.name,
                            rev: f.eTag,
                            dir: !!f.folder
                        }));
                    return callback && callback(null, fileList);
                },
                error: err => {
                    this.logger.error('List error', this.logger.ts(ts), err);
                    return callback && callback(err);
                }
            });
        });
    }

    remove(path, callback) {
        this.logger.debug('Remove', path);
        const ts = this.logger.ts();
        const url = this._baseUrl + path;
        this._xhr({
            url,
            method: 'DELETE',
            responseType: 'json',
            statuses: [200, 204],
            success: () => {
                this.logger.debug('Removed', path, this.logger.ts(ts));
                return callback && callback();
            },
            error: err => {
                this.logger.error('Remove error', path, err, this.logger.ts(ts));
                return callback && callback(err);
            }
        });
    }

    mkdir(path, callback) {
        this._oauthAuthorize(err => {
            if (err) {
                return callback && callback(err);
            }
            this.logger.debug('Make dir', path);
            const ts = this.logger.ts();
            const url = this._baseUrl + '/drive/root/children';
            const data = JSON.stringify({ name: path.replace('/drive/root:/', ''), folder: {} });
            this._xhr({
                url,
                method: 'POST',
                responseType: 'json',
                statuses: [200, 204],
                data,
                dataType: 'application/json',
                success: () => {
                    this.logger.debug('Made dir', path, this.logger.ts(ts));
                    return callback && callback();
                },
                error: err => {
                    this.logger.error('Make dir error', path, err, this.logger.ts(ts));
                    return callback && callback(err);
                }
            });
        });
    }

    setEnabled(enabled) {
        if (!enabled) {
            const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri={url}'.replace(
                '{url}',
                this._getOauthRedirectUrl()
            );
            this._oauthRevokeToken(url);
        }
        super.setEnabled(enabled);
    }

    _getOAuthConfig() {
        let clientId = this.appSettings.onedriveClientId;
        let clientSecret = this.appSettings.onedriveClientSecret;
        if (!clientId || !clientSecret) {
            if (Features.isLocal) {
                ({ id: clientId, secret: clientSecret } = OneDriveApps.Local);
            } else {
                ({ id: clientId, secret: clientSecret } = OneDriveApps.Production);
            }
        }
        return {
            url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            scope: 'files.readwrite offline_access',
            clientId,
            clientSecret,
            pkce: true,
            width: 600,
            height: 500
        };
    }
}

export { StorageOneDrive };
