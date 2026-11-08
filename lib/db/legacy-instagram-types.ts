// Historical database payloads only. The Instagram integration has been removed.
export interface InstagramProfile {
  id: string
  username: string
  name?: string
  biography?: string
  website?: string
  profile_picture_url?: string
  followers_count?: number
  follows_count?: number
  media_count?: number
}
export interface InstagramMedia {
  id: string
  caption?: string
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp: string
  like_count?: number
  comments_count?: number
  children?: { data: InstagramMedia[] }
}
