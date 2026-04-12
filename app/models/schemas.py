from typing import Optional

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
	id: int
	username: EmailStr
	class Config:
		from_attributes = True


class UserCreate(BaseModel):
	username: EmailStr
	password: str


class TokenResponse(BaseModel):
	access_token: str
	token_type: str
	expires_in: int

class UserUpdate(BaseModel):
	name: Optional[str] = None
	email: Optional[str] = None

