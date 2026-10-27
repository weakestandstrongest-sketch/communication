
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "albums": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string,"group_id": string,"id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"group_id": string,"id"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"group_id"?: string,"id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "albums_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "albums_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"announcement_reads": {
                  Row: {
                    "announcement_id": string,"read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "announcement_id": string,"read_at"?: string,"user_id": string
                  }
                  Update: {
                    "announcement_id"?: string,"read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_reads_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcement_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"event_id": string | null,"group_id": string,"id": string,"important": boolean,"pinned": boolean,"poll_id": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"event_id"?: string | null,"group_id": string,"id"?: string,"important"?: boolean,"pinned"?: boolean,"poll_id"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"event_id"?: string | null,"group_id"?: string,"id"?: string,"important"?: boolean,"pinned"?: boolean,"poll_id"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "conversation_id": string,"joined_at": string,"last_read_at": string,"muted": boolean,"pinned": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"joined_at"?: string,"last_read_at"?: string,"muted"?: boolean,"pinned"?: boolean,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"joined_at"?: string,"last_read_at"?: string,"muted"?: boolean,"pinned"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"direct_key": string | null,"group_id": string | null,"id": string,"kind": Database["public"]['Enums']["conversation_kind"],"last_message_at": string | null,"last_message_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"direct_key"?: string | null,"group_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["conversation_kind"],"last_message_at"?: string | null,"last_message_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"direct_key"?: string | null,"group_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["conversation_kind"],"last_message_at"?: string | null,"last_message_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_last_message_fk"
      columns: ["last_message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"event_attendance": {
                  Row: {
                    "comment": string,"event_id": string,"status": Database["public"]['Enums']["attendance_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string,"event_id": string,"status": Database["public"]['Enums']["attendance_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "comment"?: string,"event_id"?: string,"status"?: Database["public"]['Enums']["attendance_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_attendance_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_attendance_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"attendance_visibility": string,"canceled_at": string | null,"category": Database["public"]['Enums']["event_category"],"created_at": string,"created_by": string | null,"description": string,"ends_at": string | null,"going_count": number,"group_id": string | null,"id": string,"image_path": string | null,"location": string,"maybe_count": number,"not_going_count": number,"personal_user_id": string | null,"rsvp_deadline": string | null,"rsvp_enabled": boolean,"starts_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"attendance_visibility"?: string,"canceled_at"?: string | null,"category"?: Database["public"]['Enums']["event_category"],"created_at"?: string,"created_by"?: string | null,"description"?: string,"ends_at"?: string | null,"going_count"?: number,"group_id"?: string | null,"id"?: string,"image_path"?: string | null,"location"?: string,"maybe_count"?: number,"not_going_count"?: number,"personal_user_id"?: string | null,"rsvp_deadline"?: string | null,"rsvp_enabled"?: boolean,"starts_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"attendance_visibility"?: string,"canceled_at"?: string | null,"category"?: Database["public"]['Enums']["event_category"],"created_at"?: string,"created_by"?: string | null,"description"?: string,"ends_at"?: string | null,"going_count"?: number,"group_id"?: string | null,"id"?: string,"image_path"?: string | null,"location"?: string,"maybe_count"?: number,"not_going_count"?: number,"personal_user_id"?: string | null,"rsvp_deadline"?: string | null,"rsvp_enabled"?: boolean,"starts_at"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_personal_user_id_fkey"
      columns: ["personal_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_posts": {
                  Row: {
                    "body": string,"created_at": string,"group_id": string,"id": string,"like_count": number,"reply_count": number,"topic": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"group_id": string,"id"?: string,"like_count"?: number,"reply_count"?: number,"topic"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"group_id"?: string,"id"?: string,"like_count"?: number,"reply_count"?: number,"topic"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_posts_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_replies": {
                  Row: {
                    "alias_no": number,"body": string,"created_at": string,"group_id": string,"id": string,"like_count": number,"post_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias_no": number,"body": string,"created_at"?: string,"group_id": string,"id"?: string,"like_count"?: number,"post_id": string
                  }
                  Update: {
                    "alias_no"?: number,"body"?: string,"created_at"?: string,"group_id"?: string,"id"?: string,"like_count"?: number,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_replies_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_replies_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "feedback_posts"
      referencedColumns: ["id"]
    }
                  ]
                },"group_invites": {
                  Row: {
                    "code": string,"enabled": boolean,"group_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string,"enabled"?: boolean,"group_id": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"enabled"?: boolean,"group_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_invites_group_id_fkey"
      columns: ["group_id"]
isOneToOne: true
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "group_id": string,"joined_at": string,"role": Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"joined_at"?: string,"role"?: Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"joined_at"?: string,"role"?: Database["public"]['Enums']["group_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "color": string,"created_at": string,"created_by": string | null,"description": string,"icon_path": string | null,"id": string,"member_can_create_events": boolean,"member_can_create_polls": boolean,"member_can_invite": boolean,"member_can_post_announcements": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"icon_path"?: string | null,"id"?: string,"member_can_create_events"?: boolean,"member_can_create_polls"?: boolean,"member_can_invite"?: boolean,"member_can_post_announcements"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"icon_path"?: string | null,"id"?: string,"member_can_create_events"?: boolean,"member_can_create_polls"?: boolean,"member_can_invite"?: boolean,"member_can_post_announcements"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"media_items": {
                  Row: {
                    "album_id": string | null,"conversation_id": string | null,"created_at": string,"file_name": string,"group_id": string | null,"height": number | null,"id": string,"message_id": string | null,"mime_type": string,"size_bytes": number,"storage_path": string,"thumb_path": string | null,"uploader_id": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "album_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"file_name"?: string,"group_id"?: string | null,"height"?: number | null,"id"?: string,"message_id"?: string | null,"mime_type": string,"size_bytes"?: number,"storage_path": string,"thumb_path"?: string | null,"uploader_id"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "album_id"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"file_name"?: string,"group_id"?: string | null,"height"?: number | null,"id"?: string,"message_id"?: string | null,"mime_type"?: string,"size_bytes"?: number,"storage_path"?: string,"thumb_path"?: string | null,"uploader_id"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_items_album_id_fkey"
      columns: ["album_id"]
isOneToOne: false
      referencedRelation: "albums"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_items_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_items_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_items_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_items_uploader_id_fkey"
      columns: ["uploader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_reactions": {
                  Row: {
                    "conversation_id": string,"created_at": string,"emoji": string,"message_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"created_at"?: string,"emoji": string,"message_id": string,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"created_at"?: string,"emoji"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reactions_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "album_id": string | null,"announcement_id": string | null,"attachments": NonNullable<Json>,"body": string,"client_id": string,"conversation_id": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"event_id": string | null,"id": string,"kind": Database["public"]['Enums']["message_kind"],"mentions": (string)[],"poll_id": string | null,"reactions": NonNullable<Json>,"reply_to_id": string | null,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "album_id"?: string | null,"announcement_id"?: string | null,"attachments"?: NonNullable<Json>,"body"?: string,"client_id": string,"conversation_id": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"event_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["message_kind"],"mentions"?: (string)[],"poll_id"?: string | null,"reactions"?: NonNullable<Json>,"reply_to_id"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "album_id"?: string | null,"announcement_id"?: string | null,"attachments"?: NonNullable<Json>,"body"?: string,"client_id"?: string,"conversation_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"event_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["message_kind"],"mentions"?: (string)[],"poll_id"?: string | null,"reactions"?: NonNullable<Json>,"reply_to_id"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_album_id_fkey"
      columns: ["album_id"]
isOneToOne: false
      referencedRelation: "albums"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_reply_to_id_fkey"
      columns: ["reply_to_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "announcements": boolean,"events": boolean,"group_id": string,"mentions": boolean,"messages": boolean,"polls": boolean,"reminders": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "announcements"?: boolean,"events"?: boolean,"group_id": string,"mentions"?: boolean,"messages"?: boolean,"polls"?: boolean,"reminders"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "announcements"?: boolean,"events"?: boolean,"group_id"?: string,"mentions"?: boolean,"messages"?: boolean,"polls"?: boolean,"reminders"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string,"created_at": string,"dedupe_key": string | null,"group_id": string | null,"id": string,"kind": string,"link": string,"push": boolean,"read_at": string | null,"ref_id": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"dedupe_key"?: string | null,"group_id"?: string | null,"id"?: string,"kind": string,"link"?: string,"push"?: boolean,"read_at"?: string | null,"ref_id"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"dedupe_key"?: string | null,"group_id"?: string | null,"id"?: string,"kind"?: string,"link"?: string,"push"?: boolean,"read_at"?: string | null,"ref_id"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"poll_options": {
                  Row: {
                    "id": string,"label": string,"poll_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"label": string,"poll_id": string,"position": number
                  }
                  Update: {
                    "id"?: string,"label"?: string,"poll_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_options_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["id"]
    }
                  ]
                },"poll_responses": {
                  Row: {
                    "created_at": string,"free_text": string | null,"poll_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"free_text"?: string | null,"poll_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"free_text"?: string | null,"poll_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_responses_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "poll_responses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"poll_votes": {
                  Row: {
                    "created_at": string,"option_id": string,"poll_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"option_id": string,"poll_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"option_id"?: string,"poll_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_votes_option_id_fkey"
      columns: ["option_id"]
isOneToOne: false
      referencedRelation: "poll_options"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "poll_votes_poll_id_user_id_fkey"
      columns: ["poll_id","user_id"]
isOneToOne: false
      referencedRelation: "poll_responses"
      referencedColumns: ["poll_id","user_id"]
    }
                  ]
                },"polls": {
                  Row: {
                    "allow_change": boolean,"allow_free_text": boolean,"anonymous": boolean,"closed_at": string | null,"created_at": string,"created_by": string | null,"deadline": string | null,"description": string,"group_id": string,"id": string,"multiple": boolean,"response_count": number,"result_visibility": Database["public"]['Enums']["poll_result_visibility"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_change"?: boolean,"allow_free_text"?: boolean,"anonymous"?: boolean,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deadline"?: string | null,"description"?: string,"group_id": string,"id"?: string,"multiple"?: boolean,"response_count"?: number,"result_visibility"?: Database["public"]['Enums']["poll_result_visibility"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "allow_change"?: boolean,"allow_free_text"?: boolean,"anonymous"?: boolean,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deadline"?: string | null,"description"?: string,"group_id"?: string,"id"?: string,"multiple"?: boolean,"response_count"?: number,"result_visibility"?: Database["public"]['Enums']["poll_result_visibility"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "polls_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "polls_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string,"created_at": string,"display_name": string,"id": string,"last_seen_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string,"created_at"?: string,"display_name": string,"id": string,"last_seen_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string,"created_at"?: string,"display_name"?: string,"id"?: string,"last_seen_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"failure_count": number,"id": string,"last_success_at": string | null,"p256dh": string,"user_agent": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"failure_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh": string,"user_agent"?: string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"failure_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh"?: string,"user_agent"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "push_preview": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "push_preview"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "push_preview"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_access_media_path":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_delete_media_path":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_upload_media_path":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_view_event_attendance":
{ Args: { "p_event_id": string }; Returns: boolean
                           },
"can_view_profile":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"create_announcement":
{ Args: { "p_body": string,"p_event_id"?: string,"p_group_id": string,"p_important"?: boolean,"p_pinned"?: boolean,"p_poll_id"?: string,"p_post_to_chat"?: boolean,"p_title": string }; Returns: string
                           },
"create_event":
{ Args: { "p_all_day"?: boolean,"p_attendance_visibility"?: string,"p_category"?: Database["public"]['Enums']["event_category"],"p_description"?: string,"p_ends_at"?: string,"p_group_id": string,"p_image_path"?: string,"p_location"?: string,"p_post_to_chat"?: boolean,"p_rsvp_deadline"?: string,"p_rsvp_enabled"?: boolean,"p_starts_at": string,"p_title": string }; Returns: string
                           },
"create_feedback_post":
{ Args: { "p_body": string,"p_group_id": string,"p_topic"?: string }; Returns: string
                           },
"create_feedback_reply":
{ Args: { "p_body": string,"p_post_id": string }; Returns: string
                           },
"create_group":
{ Args: { "p_color"?: string,"p_description"?: string,"p_name": string }; Returns: string
                           },
"create_personal_event":
{ Args: { "p_all_day"?: boolean,"p_category"?: Database["public"]['Enums']["event_category"],"p_description"?: string,"p_ends_at"?: string,"p_location"?: string,"p_starts_at": string,"p_title": string }; Returns: string
                           },
"create_poll":
{ Args: { "p_allow_change"?: boolean,"p_allow_free_text"?: boolean,"p_anonymous"?: boolean,"p_deadline"?: string,"p_description"?: string,"p_group_id": string,"p_multiple"?: boolean,"p_options": (string)[],"p_post_to_chat"?: boolean,"p_result_visibility"?: Database["public"]['Enums']["poll_result_visibility"],"p_title": string }; Returns: string
                           },
"delete_feedback":
{ Args: { "p_id": string,"p_kind": string }; Returns: undefined
                           },
"delete_message":
{ Args: { "p_message_id": string }; Returns: (string)[]
                           },
"edit_message":
{ Args: { "p_body": string,"p_message_id": string }; Returns: {
              "album_id": string | null,
"announcement_id": string | null,
"attachments": NonNullable<Json>,
"body": string,
"client_id": string,
"conversation_id": string,
"created_at": string,
"deleted_at": string | null,
"edited_at": string | null,
"event_id": string | null,
"id": string,
"kind": Database["public"]['Enums']["message_kind"],
"mentions": (string)[],
"poll_id": string | null,
"reactions": NonNullable<Json>,
"reply_to_id": string | null,
"sender_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "messages"
        isOneToOne: true
        isSetofReturn: false
      } },
"event_group_id":
{ Args: { "p_event_id": string }; Returns: string
                           },
"feedback_topics":
{ Args: { "p_group_id": string }; Returns: {
              "post_count": number,"topic": string
            }[]
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_announcement_read_count":
{ Args: { "p_announcement_id": string }; Returns: Json
                           },
"get_conversations":
{ Args: Record<PropertyKey, never>; Returns: {
              "group_color": string,"group_icon_path": string,"group_id": string,"group_name": string,"id": string,"kind": Database["public"]['Enums']["conversation_kind"],"last_message_at": string,"last_message_body": string,"last_message_deleted": boolean,"last_message_kind": Database["public"]['Enums']["message_kind"],"last_message_sender_id": string,"last_message_sender_name": string,"last_read_at": string,"member_count": number,"mention_count": number,"muted": boolean,"peer_avatar_url": string,"peer_id": string,"peer_name": string,"pinned": boolean,"unread_count": number
            }[]
                           },
"get_event_attendance":
{ Args: { "p_event_id": string }; Returns: Json
                           },
"get_feedback_thread":
{ Args: { "p_post_id": string }; Returns: Json
                           },
"get_or_create_direct":
{ Args: { "p_user_id": string }; Returns: string
                           },
"get_poll_results":
{ Args: { "p_poll_id": string }; Returns: Json
                           },
"group_role_of":
{ Args: { "p_group_id": string }; Returns: Database["public"]['Enums']["group_role"]
                           },
"is_conversation_member":
{ Args: { "p_conversation_id": string }; Returns: boolean
                           },
"is_group_admin":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"join_group":
{ Args: { "p_code": string }; Returns: string
                           },
"leave_group":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"list_feedback":
{ Args: { "p_before"?: string,"p_group_id": string,"p_limit"?: number,"p_sort"?: string,"p_topic"?: string }; Returns: {
              "body": string,"created_at": string,"group_id": string,"id": string,"like_count": number,"liked": boolean,"mine": boolean,"reply_count": number,"topic": string
            }[]
                           },
"list_polls":
{ Args: { "p_group_id"?: string }; Returns: {
              "anonymous": boolean,"closed_at": string,"created_at": string,"created_by": string,"creator_name": string,"deadline": string,"description": string,"eligible_count": number,"group_color": string,"group_id": string,"group_name": string,"id": string,"is_closed": boolean,"multiple": boolean,"responded": boolean,"response_count": number,"title": string
            }[]
                           },
"mark_conversation_read":
{ Args: { "p_conversation_id": string }; Returns: string
                           },
"owns_storage_object":
{ Args: { "p_path": string }; Returns: boolean
                           },
"poll_group_id":
{ Args: { "p_poll_id": string }; Returns: string
                           },
"preview_invite":
{ Args: { "p_code": string }; Returns: {
              "already_member": boolean,"color": string,"description": string,"group_id": string,"member_count": number,"name": string
            }[]
                           },
"regenerate_invite":
{ Args: { "p_group_id": string }; Returns: string
                           },
"register_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: undefined
                           },
"remove_member":
{ Args: { "p_group_id": string,"p_user_id": string }; Returns: undefined
                           },
"retract_poll_response":
{ Args: { "p_poll_id": string }; Returns: undefined
                           },
"send_message":
{ Args: { "p_attachments"?: Json,"p_body": string,"p_client_id": string,"p_conversation_id": string,"p_mentions"?: (string)[],"p_reply_to_id"?: string }; Returns: {
              "album_id": string | null,
"announcement_id": string | null,
"attachments": NonNullable<Json>,
"body": string,
"client_id": string,
"conversation_id": string,
"created_at": string,
"deleted_at": string | null,
"edited_at": string | null,
"event_id": string | null,
"id": string,
"kind": Database["public"]['Enums']["message_kind"],
"mentions": (string)[],
"poll_id": string | null,
"reactions": NonNullable<Json>,
"reply_to_id": string | null,
"sender_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "messages"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_attendance":
{ Args: { "p_comment"?: string,"p_event_id": string,"p_status": Database["public"]['Enums']["attendance_status"] }; Returns: undefined
                           },
"set_event_canceled":
{ Args: { "p_canceled": boolean,"p_event_id": string }; Returns: undefined
                           },
"set_invite_enabled":
{ Args: { "p_enabled": boolean,"p_group_id": string }; Returns: undefined
                           },
"set_member_role":
{ Args: { "p_group_id": string,"p_role": Database["public"]['Enums']["group_role"],"p_user_id": string }; Returns: undefined
                           },
"set_poll_closed":
{ Args: { "p_closed": boolean,"p_poll_id": string }; Returns: undefined
                           },
"share_to_chat":
{ Args: { "p_id": string,"p_kind": Database["public"]['Enums']["message_kind"] }; Returns: string
                           },
"submit_poll_response":
{ Args: { "p_free_text"?: string,"p_option_ids": (string)[],"p_poll_id": string }; Returns: undefined
                           },
"toggle_feedback_like":
{ Args: { "p_id": string,"p_kind": string }; Returns: boolean
                           },
"toggle_reaction":
{ Args: { "p_emoji": string,"p_message_id": string }; Returns: boolean
                           },
"try_uuid":
{ Args: { "value": string }; Returns: string
                           },
"update_event":
{ Args: { "p_all_day": boolean,"p_attendance_visibility": string,"p_category": Database["public"]['Enums']["event_category"],"p_description": string,"p_ends_at": string,"p_event_id": string,"p_image_path"?: string,"p_location": string,"p_rsvp_deadline": string,"p_rsvp_enabled": boolean,"p_starts_at": string,"p_title": string }; Returns: undefined
                           },
"update_poll":
{ Args: { "p_deadline": string,"p_description": string,"p_poll_id": string,"p_title": string }; Returns: undefined
                           }
          }
          Enums: {
            "attendance_status": "going"|"not_going"|"maybe","conversation_kind": "group"|"direct","event_category": "practice"|"match"|"meeting"|"social"|"trip"|"other","group_role": "owner"|"admin"|"member","message_kind": "text"|"image"|"file"|"poll"|"event"|"announcement"|"album"|"system","poll_result_visibility": "always"|"after_vote"|"after_close"|"admins"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "attendance_status": ["going", "not_going", "maybe"],"conversation_kind": ["group", "direct"],"event_category": ["practice", "match", "meeting", "social", "trip", "other"],"group_role": ["owner", "admin", "member"],"message_kind": ["text", "image", "file", "poll", "event", "announcement", "album", "system"],"poll_result_visibility": ["always", "after_vote", "after_close", "admins"]
          }
        }
} as const
