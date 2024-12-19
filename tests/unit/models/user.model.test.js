const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const User = require('../../../src/models/user.model');
const { roles } = require('../../../src/config/roles');

describe('User Model', () => {
  it('should have a schema', () => {
    expect(User.schema).toBeDefined();
  });

  it('should have a name field', () => {
    const name = User.schema.obj.name;
    expect(name).toBeDefined();
    expect(name.type).toBe(String);
    expect(name.required).toBe(true);
    expect(name.trim).toBe(true);
  });

  it('should have an email field', () => {
    const email = User.schema.obj.email;
    expect(email).toBeDefined();
    expect(email.type).toBe(String);
    expect(email.required).toBe(true);
    expect(email.unique).toBe(true);
    expect(email.trim).toBe(true);
    expect(email.lowercase).toBe(true);
    expect(email.validate).toBeDefined();
  });

  it('should have a password field', () => {
    const password = User.schema.obj.password;
    expect(password).toBeDefined();
    expect(password.type).toBe(String);
    expect(password.required).toBe(true);
    expect(password.trim).toBe(true);
    expect(password.minlength).toBe(8);
    expect(password.validate).toBeDefined();
    expect(password.private).toBe(true);
  });

  it('should have a role field', () => {
    const role = User.schema.obj.role;
    expect(role).toBeDefined();
    expect(role.type).toBe(String);
    expect(role.enum).toEqual(roles);
    expect(role.default).toBe('user');
  });

  it('should have an isEmailVerified field', () => {
    const isEmailVerified = User.schema.obj.isEmailVerified;
    expect(isEmailVerified).toBeDefined();
    expect(isEmailVerified.type).toBe(Boolean);
    expect(isEmailVerified.default).toBe(false);
  });

  it('should have a citizenId field', () => {
    const citizenId = User.schema.obj.citizenId;
    expect(citizenId).toBeDefined();
    expect(citizenId.type).toBe(String);
    expect(citizenId.trim).toBe(true);
    expect(citizenId.required).toBe(false);
  });

  it('should have a phoneNumber field', () => {
    const phoneNumber = User.schema.obj.phoneNumber;
    expect(phoneNumber).toBeDefined();
    expect(phoneNumber.type).toBe(String);
    expect(phoneNumber.trim).toBe(true);
    expect(phoneNumber.validate).toBeDefined();
    expect(phoneNumber.required).toBe(false);
  });

  it('should have an address field', () => {
    const address = User.schema.obj.address;
    expect(address).toBeDefined();
    expect(address.province.type).toBe(String);
    expect(address.province.trim).toBe(true);
    expect(address.province.required).toBe(false);
    expect(address.district.type).toBe(String);
    expect(address.district.trim).toBe(true);
    expect(address.district.required).toBe(false);
    expect(address.town.type).toBe(String);
    expect(address.town.trim).toBe(true);
    expect(address.town.required).toBe(false);
    expect(address.street.type).toBe(String);
    expect(address.street.trim).toBe(true);
    expect(address.street.required).toBe(false);
  });

  it('should have a status field', () => {
    const status = User.schema.obj.status;
    expect(status).toBeDefined();
    expect(status.type).toBe(String);
    expect(status.enum).toEqual(['active', 'inactive', 'suspended', 'deleted']);
    expect(status.default).toBe('active');
  });

  it('should have timestamps', () => {
    const timestamps = User.schema.options.timestamps;
    expect(timestamps).toBe(true);
  });

  it('should have toJSON and paginate plugins', () => {
    const plugins = User.schema.plugins.map((plugin) => plugin.fn.name);
    expect(plugins).toContain('toJSON');
    expect(plugins).toContain('paginate');
  });

  it('should have a static method isEmailTaken', () => {
    expect(typeof User.isEmailTaken).toBe('function');
  });

  it('should have a method isPasswordMatch', () => {
    expect(typeof User.prototype.isPasswordMatch).toBe('function');
  });
});
