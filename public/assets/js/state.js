'use strict';
 
let accessToken = localStorage.getItem('ak_access') || null;
let refreshToken = localStorage.getItem('ak_refresh') || null;
let currentUser = null;
let currentProjectId = null;
let selectedKeyType = 'secret';
let projects = [];
let userCountInterval = null;
 